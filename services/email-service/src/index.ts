import express from "express";
import {
  Broker,
  createBroker,
  createLogger,
  createMailer,
  defaultBrokerUrl,
  env,
  envInt,
} from "@smart/shared";
import { startEmailConsumers } from "./consumers";

/**
 * Email Service (diagram: "Email Service", fed by the "Message Broker").
 *
 * The only service with no database of its own (AMQP-only): it consumes
 * itinerary.created / itinerary.shared / group.invited notifications plus
 * TTL-expired reminders, and sends mail over SMTP (Mailpit locally, SES's
 * SMTP interface on AWS — see @smart/shared's mailer adapter).
 *
 * Port 8085 · env vars: SERVICE_NAME, PORT, AMQP_URL, SMTP_HOST, SMTP_PORT,
 * SMTP_USER?, SMTP_PASS?, MAIL_FROM, MAILER_DRY_RUN, OWNER_EMAIL_FALLBACK,
 * WEB_APP_URL, LOG_LEVEL.
 *
 * The HTTP server exists only for /healthz (compose healthcheck): it binds
 * immediately and reports broker status in the body, so a slow/absent
 * RabbitMQ never looks like a crashed container.
 */

const serviceName = env("SERVICE_NAME", "email-service");
const port = envInt("PORT", 8085);
const logger = createLogger(serviceName);

/** How long to wait between RabbitMQ connection attempts. */
const BROKER_RETRY_MS = 5_000;

/** RabbitMQ reachability, surfaced through /healthz. */
let brokerStatus: "connecting" | "connected" | "retrying" = "connecting";
/** The live connection, kept only for clean shutdown. */
let connectedBroker: Broker | null = null;

const app = express();
app.get("/healthz", (_req, res) => {
  // Always HTTP 200 — process-alive, like the gateway's own health design.
  // The body carries the honest broker state for humans and dashboards.
  res.json({ status: "ok", service: serviceName, broker: brokerStatus });
});

const server = app.listen(port, () => {
  logger.info({ port }, `${serviceName} listening`);
});

const mailer = createMailer();

/**
 * Connect and start consuming, retrying forever. compose gates startup on
 * rabbitmq being healthy, but RabbitMQ can still restart (or come up after a
 * bare-metal service start) — notifications pause and retry instead of the
 * process dying with them.
 *
 * Known limit: once connected there is no auto-reconnect (the shared broker
 * adapter exposes none) — a mid-session broker restart needs a container
 * restart; flagged in docs/TASKS.md for the next shared-touching task.
 */
async function connectAndConsume(): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      const broker = await createBroker(defaultBrokerUrl());
      try {
        await startEmailConsumers(broker, mailer);
      } catch (error) {
        // Don't leak a half-wired connection — release it before the retry.
        await broker
          .close()
          .catch((closeError) => logger.warn({ err: closeError }, "broker close after failed consume also failed"));
        throw error;
      }
      connectedBroker = broker;
      brokerStatus = "connected";
      logger.info("RabbitMQ connected — consuming notifications and reminders");
      return;
    } catch (error) {
      brokerStatus = "retrying";
      logger.error(
        { err: error, attempt },
        `RabbitMQ unavailable — email notifications paused, retrying in ${BROKER_RETRY_MS}ms`
      );
      await new Promise((resolve) => setTimeout(resolve, BROKER_RETRY_MS));
    }
  }
}
void connectAndConsume();

// Graceful shutdown on `docker stop`: stop accepting probes, close the
// broker connection, exit. Unacked in-flight messages get redelivered.
process.on("SIGTERM", () => {
  logger.info("SIGTERM received — shutting down");
  server.close(() => {
    void Promise.resolve(connectedBroker?.close())
      .catch((error) => logger.warn({ err: error }, "broker close failed during shutdown"))
      .finally(() => process.exit(0));
  });
  // Hard exit if a connection hangs; unref() keeps it from blocking shutdown.
  setTimeout(() => process.exit(1), 10_000).unref();
});
