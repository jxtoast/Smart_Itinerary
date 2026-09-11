import { Broker, Mailer, QUEUES, ROUTING_KEYS, createLogger } from "@smart/shared/src/server";
import {
  handleGroupInvited,
  handleItineraryCreated,
  handleItineraryShared,
  handleReminderDue,
} from "./handlers";

/**
 * Queue wiring for the Email Service (diagram: "Message Broker" → "Email
 * Service"). Queue names and bindings are owned by @smart/shared's broker
 * adapter (packages/shared/src/adapters/broker.ts), which createBroker()
 * already installed before this runs:
 *
 *   si.events (topic exchange)
 *     ├─ email.events   ← itinerary.* + group.*      (this file consumes)
 *     ├─ reminders.due  ← email.reminder.due          (this file consumes)
 *     └─ reminders.waiting (no binding — per-message TTL, dead-letters back
 *        onto the exchange as email.reminder.due)
 */

const logger = createLogger("email-consumers");

/**
 * Structural subset of amqplib's ConsumeMessage — dispatch only reads the
 * routing key, so this file never imports amqplib directly (it is
 * @smart/shared's dependency, not ours).
 */
interface ConsumedMessage {
  fields: { routingKey: string };
}

/**
 * Route one email.events message to its handler by routing key. Everything
 * under itinerary.* / group.* lands here, so future sibling events (say
 * itinerary.updated) are logged and acked unprocessed instead of wedging the
 * queue — add a case here when their consumer ships.
 */
async function dispatchEmailEvent(
  broker: Broker,
  mailer: Mailer,
  message: ConsumedMessage,
  payload: unknown
): Promise<void> {
  const routingKey = message.fields.routingKey;
  switch (routingKey) {
    case ROUTING_KEYS.itineraryCreated:
      return handleItineraryCreated(broker, mailer, payload);
    case ROUTING_KEYS.itineraryShared:
      return handleItineraryShared(mailer, payload);
    case ROUTING_KEYS.groupInvited:
      return handleGroupInvited(mailer, payload);
    default:
      logger.warn({ routingKey }, "no handler for this routing key — event acked unprocessed");
  }
}

/** Subscribe to both queues; resolves once both consume() calls are live. */
export async function startEmailConsumers(broker: Broker, mailer: Mailer): Promise<void> {
  await broker.consume(QUEUES.emailEvents, async (payload, message) =>
    dispatchEmailEvent(broker, mailer, message, payload)
  );
  await broker.consume(QUEUES.remindersDue, async (payload) => handleReminderDue(mailer, payload));
  logger.info(
    { queues: [QUEUES.emailEvents, QUEUES.remindersDue] },
    "email-service consumers started"
  );
}
