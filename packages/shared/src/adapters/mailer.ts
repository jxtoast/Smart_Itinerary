import nodemailer, { Transporter } from "nodemailer";
import { createLogger } from "./http";
import { env, envInt, isTruthy } from "./config";

/**
 * Email adapter (diagram: "Email Service"). Sends over SMTP, which works
 * against Mailpit locally and Amazon SES's SMTP interface on AWS — only the
 * env vars change.
 *
 * Env: SMTP_HOST, SMTP_PORT, SMTP_USER?, SMTP_PASS?, MAIL_FROM, MAILER_DRY_RUN?
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

  const from = env("MAIL_FROM", "Smart Itinerary <no-reply@smart-itinerary.local>");

  return {
    async send(message) {
      await smtp.sendMail({ from, ...message });
      logger.info({ to: message.to, subject: message.subject }, "email sent");
    },
  };
}
