import amqp, { Options, Replies } from "amqplib";
import { z } from "zod";
import { env, requireEnv } from "./config";
import { createLogger } from "./http";
import {
  EVENT_EXCHANGE,
  ItineraryCreatedEventSchema,
  QUEUES,
  ROUTING_KEYS,
  reminderDelayMs,
} from "../events";

/**
 * RabbitMQ adapter (diagram: "Message Broker — RabbitMQ").
 *
 * Topology:
 *   topic exchange `si.events`
 *     - email.events  <- itinerary.created, itinerary.shared, group.invited
 *     - reminders.due <- email.reminder.due
 *   reminders.waiting (no binding) <- reminder events published with a
 *     per-message TTL; on expiry RabbitMQ dead-letters them to `si.events`
 *     with routing key `email.reminder.due`. No delayed-message plugin needed.
 *
 * Note: RabbitMQ expires per-message TTLs from the head of the queue, so a
 * long delay ahead of a short one delays it further — acceptable for this
 * workload (demo reminders).
 *
 * AWS swap: AMQP_URL -> Amazon MQ (RabbitMQ endpoint); topology identical.
 */

const logger = createLogger("broker");

export interface Broker {
  publish(routingKey: string, payload: unknown): Promise<void>;
  /** Queue a reminder that dead-letters into `email.reminder.due` at the right time. */
  scheduleReminder(event: unknown, startDate: string): Promise<void>;
  consume(
    queue: string,
    handler: (payload: unknown, msg: amqp.ConsumeMessage) => Promise<void>,
    routingPatterns?: string[]
  ): Promise<Replies.Consume>;
  close(): Promise<void>;
}

export async function createBroker(urlOverride?: string): Promise<Broker> {
  const url = urlOverride ?? requireEnv("AMQP_URL");
  const connection = await amqp.connect(url);
  const channel = await connection.createChannel();

  await channel.assertExchange(EVENT_EXCHANGE, "topic", { durable: true });

  // Reminder scheduling via native message-TTL + dead-lettering.
  await channel.assertQueue(QUEUES.remindersWaiting, {
    durable: true,
    arguments: {
      "x-dead-letter-exchange": EVENT_EXCHANGE,
      "x-dead-letter-routing-key": ROUTING_KEYS.reminderDue,
    } as Options.AssertQueue["arguments"],
  });
  await channel.assertQueue(QUEUES.remindersDue, { durable: true });
  await channel.bindQueue(QUEUES.remindersDue, EVENT_EXCHANGE, ROUTING_KEYS.reminderDue);
  await channel.assertQueue(QUEUES.emailEvents, { durable: true });
  await channel.bindQueue(QUEUES.emailEvents, EVENT_EXCHANGE, "itinerary.*");
  await channel.bindQueue(QUEUES.emailEvents, EVENT_EXCHANGE, "group.*");

  return {
    async publish(routingKey, payload) {
      channel.publish(EVENT_EXCHANGE, routingKey, Buffer.from(JSON.stringify(payload)), {
        contentType: "application/json",
        persistent: true,
      });
    },

    async scheduleReminder(event, startDate) {
      const parsed = ItineraryCreatedEventSchema.parse(event);
      const ttlMs = reminderDelayMs(startDate);
      // Direct publish to the holding queue (default exchange); TTL expiry
      // dead-letters the message onto si.events / email.reminder.due.
      channel.sendToQueue(QUEUES.remindersWaiting, Buffer.from(JSON.stringify(parsed)), {
        contentType: "application/json",
        persistent: true,
        expiration: String(ttlMs),
      });
      logger.info({ itineraryId: parsed.itineraryId, ttlMs }, "reminder scheduled");
    },

    async consume(queue, handler, routingPatterns) {
      await channel.assertQueue(queue, { durable: true });
      for (const pattern of routingPatterns ?? []) {
        await channel.bindQueue(queue, EVENT_EXCHANGE, pattern);
      }
      return channel.consume(queue, (msg) => {
        if (!msg) return;
        void (async () => {
          try {
            const payload = JSON.parse(msg.content.toString());
            await handler(payload, msg);
            channel.ack(msg);
          } catch (error) {
            // One retry (re-queue on first delivery); drop poison messages.
            if (!msg.fields.redelivered) {
              channel.nack(msg, false, true);
            } else {
              logger.error({ err: error, queue }, "poison message dropped");
              channel.ack(msg);
            }
          }
        })();
      });
    },

    async close() {
      await channel.close();
      await connection.close();
    },
  };
}

/** Helper for consumers that expect a specific event shape. */
export function parseEvent<T extends z.ZodTypeAny>(schema: T, payload: unknown): z.infer<T> {
  return schema.parse(payload) as z.infer<T>;
}

export function defaultBrokerUrl(): string {
  return env("AMQP_URL", "amqp://guest:guest@localhost:5672");
}
