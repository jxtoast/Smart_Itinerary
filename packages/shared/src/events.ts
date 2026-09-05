import { z } from "zod";

/**
 * Event contracts for the RabbitMQ broker (diagram: "Message Broker — For
 * Email Events"). All services publish/consume on one topic exchange.
 *
 * AWS swap: point AMQP_URL at Amazon MQ (RabbitMQ) — contracts unchanged.
 */

/** Topic exchange all events flow through. */
export const EVENT_EXCHANGE = "si.events";

export const ROUTING_KEYS = {
  itineraryCreated: "itinerary.created",
  itineraryShared: "itinerary.shared",
  groupInvited: "group.invited",
  /** Dead-letter target of the reminders.waiting queue (message TTL expiry). */
  reminderDue: "email.reminder.due",
} as const;

export const QUEUES = {
  /** email-service: confirmation / share / invite notifications. */
  emailEvents: "email.events",
  /** Holding queue: per-message TTL = reminder delay, then dead-letters. */
  remindersWaiting: "reminders.waiting",
  /** email-service: reminder emails whose TTL has expired. */
  remindersDue: "reminders.due",
} as const;

const dateish = z.string().min(8);

export const ItineraryCreatedEventSchema = z
  .object({
    itineraryId: z.string(),
    userId: z.string(),
    destination: z.string(),
    startDate: dateish,
    endDate: dateish,
    /**
     * Where the confirmation/reminder mail goes. Optional because dev tokens
     * may carry no email claim (AuthClaims.email is optional) — consumers
     * fall back to OWNER_EMAIL_FALLBACK when it is absent.
     */
    ownerEmail: z.string().email().optional(),
  })
  .passthrough();
export type ItineraryCreatedEvent = z.infer<typeof ItineraryCreatedEventSchema>;

export const ItinerarySharedEventSchema = z
  .object({
    shareToken: z.string(),
    itineraryId: z.string(),
    groupId: z.string().optional(),
    groupName: z.string().optional(),
    sharedByEmail: z.string(),
    recipientEmails: z.array(z.string()),
    destination: z.string().optional(),
  })
  .passthrough();
export type ItinerarySharedEvent = z.infer<typeof ItinerarySharedEventSchema>;

export const GroupInvitedEventSchema = z
  .object({
    groupId: z.string(),
    groupName: z.string(),
    email: z.string(),
    inviteToken: z.string(),
    invitedByEmail: z.string(),
  })
  .passthrough();
export type GroupInvitedEvent = z.infer<typeof GroupInvitedEventSchema>;

/** ReminderDue carries the same payload that scheduled it. */
export const ReminderDueEventSchema = ItineraryCreatedEventSchema;
export type ReminderDueEvent = ItineraryCreatedEvent;

export type EventRoutingKey = (typeof ROUTING_KEYS)[keyof typeof ROUTING_KEYS];

/** Send the reminder this many hours before the trip start date. */
export const REMINDER_HOURS_BEFORE_TRIP = 24;

/**
 * Milliseconds from now until the reminder should fire (message TTL for the
 * reminders.waiting queue). Returns 0 if the trip already started — the
 * reminder then fires on the next consumer tick.
 */
export function reminderDelayMs(
  startDate: string,
  now: Date = new Date(),
  hoursBefore: number = REMINDER_HOURS_BEFORE_TRIP
): number {
  const start = new Date(startDate).getTime();
  if (Number.isNaN(start)) return 0;
  const dueAt = start - hoursBefore * 60 * 60 * 1000;
  return Math.max(0, dueAt - now.getTime());
}
