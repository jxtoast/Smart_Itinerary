import {
  Broker,
  GroupInvitedEventSchema,
  ItineraryCreatedEventSchema,
  ItinerarySharedEventSchema,
  Mailer,
  ReminderDueEventSchema,
  createLogger,
  env,
  parseEvent,
} from "@smart/shared/src/server";
import {
  groupInvitedEmail,
  itineraryCreatedEmail,
  itinerarySharedEmail,
  reminderDueEmail,
} from "./templates";

/**
 * One handler per consumed routing key (diagram: "Email Service"). Each one
 * validates the payload with the shared zod schema — a malformed event throws
 * and the shared broker adapter retries it once, then drops it as poison, so
 * a bad publisher can't wedge the queue.
 *
 * Delivery semantics are at-least-once: the message is acked after the handler
 * succeeds, so a crash between SMTP send and ack can send an email twice.
 * Acceptable for notification mail; do not build anything on exactly-once.
 */

const logger = createLogger("email-handlers");

/** Deliberately lenient — we only need "looks like an address", not RFC 5322. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Where confirmation/reminder mail goes. The shared ItineraryCreatedEvent
 * (and therefore ReminderDue) carries only `userId` — no owner address (the
 * contract gap is flagged in docs/TASKS.md and needs a shared-package change,
 * which this service must not make itself). Meanwhile: publishers MAY ride an
 * extra `ownerEmail` field (the schema is .passthrough()) — the demo script
 * does — and otherwise we fall back to one dev address that Mailpit catches.
 */
function resolveOwnerEmail(rawEvent: unknown): string {
  const candidate = (rawEvent as { ownerEmail?: unknown } | null)?.ownerEmail;
  if (typeof candidate === "string" && EMAIL_PATTERN.test(candidate)) {
    return candidate;
  }
  const fallback = env("OWNER_EMAIL_FALLBACK", "owner@smart-itinerary.local");
  logger.warn(
    { fallback },
    "event carries no usable ownerEmail — confirmation/reminder sent to OWNER_EMAIL_FALLBACK"
  );
  return fallback;
}

/**
 * itinerary.created → confirmation email to the owner, then park the same
 * payload in reminders.waiting with a per-message TTL (scheduleReminder);
 * on expiry RabbitMQ dead-letters it back to us as email.reminder.due.
 * Order matters: schedule only after the confirmation was accepted, so a
 * redelivery re-runs both, never the reminder alone.
 */
export async function handleItineraryCreated(
  broker: Broker,
  mailer: Mailer,
  payload: unknown
): Promise<void> {
  const event = parseEvent(ItineraryCreatedEventSchema, payload);
  await mailer.send({ to: resolveOwnerEmail(payload), ...itineraryCreatedEmail(event) });
  await broker.scheduleReminder(event, event.startDate);
}

/** email.reminder.due → the "your trip starts soon" email. */
export async function handleReminderDue(mailer: Mailer, payload: unknown): Promise<void> {
  const event = parseEvent(ReminderDueEventSchema, payload);
  await mailer.send({ to: resolveOwnerEmail(payload), ...reminderDueEmail(event) });
}

/**
 * itinerary.shared → one email per recipient, sent sequentially so one bad
 * address fails the batch at the first bad send (retried once, then dropped)
 * without a fan-out of duplicate mails to the good addresses on redelivery.
 */
export async function handleItineraryShared(mailer: Mailer, payload: unknown): Promise<void> {
  const event = parseEvent(ItinerarySharedEventSchema, payload);
  for (const recipientEmail of event.recipientEmails) {
    await mailer.send({
      to: recipientEmail,
      ...itinerarySharedEmail(event, recipientEmail),
    });
  }
}

/** group.invited → single invitation email to the invited address. */
export async function handleGroupInvited(mailer: Mailer, payload: unknown): Promise<void> {
  const event = parseEvent(GroupInvitedEventSchema, payload);
  await mailer.send({ to: event.email, ...groupInvitedEmail(event) });
}
