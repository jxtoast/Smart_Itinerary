import nodemailer, { Transporter } from "nodemailer";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { createLogger } from "./http";
import { env, envInt, isTruthy } from "./config";

/**
 * Email adapter (diagram: "Email Service"). Two transports, chosen by env:
 *
 *   MAILER_MODE=ses-api  → Amazon SES v2 API, signed with the ambient AWS
 *                          credential chain (on ECS: the task IAM role — no
 *                          SMTP credentials exist to mint or rotate). This
 *                          is the AWS deployment mode (2026-10-07: this
 *                          account rejects SigV2 SMTP auth entirely — every
 *                          key, including AdministratorAccess, got 535).
 *   otherwise            → SMTP via nodemailer: Mailpit in compose, SES's
 *                          SMTP interface locally. Only env vars change.
 *
 * Env: MAILER_MODE?, SMTP_HOST, SMTP_PORT, SMTP_USER?, SMTP_PASS?, MAIL_FROM,
 *      MAILER_DRY_RUN?
 */

const logger = createLogger("mailer");

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export function createMailer(transport?: Transporter): Mailer {
  if (isTruthy("MAILER_DRY_RUN")) {
    return {
      async send(message) {
        logger.warn({ to: message.to, subject: message.subject }, "MAILER_DRY_RUN — not sent");
      },
    };
  }

  const from = env("MAIL_FROM", "Smart Itinerary <no-reply@smart-itinerary.local>");

  if (env("MAILER_MODE") === "ses-api") {
    const ses = new SESv2Client({});
    return {
      async send(message) {
        // "Simple" content: subject + HTML body (+ plain-text alternative).
        // Sandbox note: both From and To must be SES-verified identities.
        await ses.send(
          new SendEmailCommand({
            FromEmailAddress: from,
            Destination: { ToAddresses: [message.to] },
            Content: {
              Simple: {
                Subject: { Data: message.subject, Charset: "UTF-8" },
                Body: {
                  Html: { Data: message.html, Charset: "UTF-8" },
                  ...(message.text
                    ? { Text: { Data: message.text, Charset: "UTF-8" } }
                    : {}),
                },
              },
            },
          })
        );
        logger.info({ to: message.to, subject: message.subject }, "email sent (SES API)");
      },
    };
  }

  const smtp =
    transport ??
    nodemailer.createTransport({
      host: env("SMTP_HOST", "localhost"),
      port: envInt("SMTP_PORT", 1025),
      secure: false,
      ...(env("SMTP_USER")
        ? { auth: { user: env("SMTP_USER"), pass: env("SMTP_PASS") } }
        : {}),
    });

  return {
    async send(message) {
      await smtp.sendMail({ from, ...message });
      logger.info({ to: message.to, subject: message.subject }, "email sent");
    },
  };
}
