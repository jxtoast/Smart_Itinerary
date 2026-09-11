import {
  GroupInvitedEvent,
  ItineraryCreatedEvent,
  ItinerarySharedEvent,
  ROUTING_KEYS,
  createBroker,
  createLogger,
  defaultBrokerUrl,
} from "@smart/shared/src/server";

/**
 * Demo publisher for the Email Service flow — lets you watch the whole
 * RabbitMQ → email-service → Mailpit path without itinerary-service or
 * tools-service running (and without a saved itinerary).
 *
 *   docker compose up -d rabbitmq mailpit email-service
 *   npm run publish-test-event --workspace @smart/email-service
 *   → open Mailpit on http://localhost:8025
 *
 * What you should see for the default `all`:
 *   • itinerary.created  → confirmation mail now + reminder ~30s later
 *     (the trip start below is 24h30s away and reminders fire 24h early,
 *     so the reminder's TTL expires while you watch — see
 *     reminderDelayMs in packages/shared/src/events.ts)
 *   • itinerary.shared   → one mail per recipient
 *   • group.invited      → one invite mail
 *
 * Usage:
 *   tsx scripts/publish-test-event.ts [all | created | shared | invited] [--start <iso>]
 *
 * `--start` overrides the demo trip's start date (e.g. --start 2026-10-01)
 * to demo a realistic far-future reminder instead of the ~30s one.
 */

const logger = createLogger("publish-test-event");

/** The seeded mock-auth user from db/init/auth-service.sql. */
const DEMO_USER_ID = "1b9472e1-a85e-43bf-9898-6f44e2b20809";

function isoAt(hoursFromNow: number): string {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString();
}

/** Fresh demo payloads on every run (no two runs share ids/tokens). */
function buildEvents(tripStart: string): {
  created: ItineraryCreatedEvent;
  shared: ItinerarySharedEvent;
  invited: GroupInvitedEvent;
} {
  // Passthrough field: the shared event schema has no owner email yet, but
  // email-service reads this one when present (see handlers.ts).
  const created: ItineraryCreatedEvent = {
    itineraryId: crypto.randomUUID(),
    userId: DEMO_USER_ID,
    destination: "Tokyo",
    startDate: tripStart,
    endDate: isoAt(24 + 0.5 / 60 + 4 * 24),
    ownerEmail: "traveller@smart-itinerary.local",
  };
  const shared: ItinerarySharedEvent = {
    shareToken: crypto.randomUUID(),
    itineraryId: created.itineraryId,
    groupName: "Tokyo Trip Crew",
    sharedByEmail: "alice@example.com",
    recipientEmails: ["bob@example.com", "carol@example.com"],
    destination: created.destination,
  };
  const invited: GroupInvitedEvent = {
    groupId: crypto.randomUUID(),
    groupName: "Tokyo Trip Crew",
    email: "dave@example.com",
    inviteToken: crypto.randomUUID(),
    invitedByEmail: "alice@example.com",
  };
  return { created, shared, invited };
}

/** Parse "[target] [--start <iso>]" from argv, exiting with usage on junk. */
function parseArgs(): { target: string; tripStart: string } {
  const args = process.argv.slice(2);
  const allowed = ["all", "created", "shared", "invited"];
  const target = args.find((arg) => !arg.startsWith("--")) ?? "all";
  if (!allowed.includes(target)) {
    console.error(`Unknown target "${target}". Use one of: ${allowed.join(", ")}`);
    process.exit(1);
  }
  const startFlagIndex = args.indexOf("--start");
  const startOverride = startFlagIndex >= 0 ? args[startFlagIndex + 1] : undefined;
  // Default start = 24h30s out → reminder TTL ≈ 30s, visible during a demo.
  const tripStart = startOverride ?? isoAt(24 + 0.5 / 60);
  return { target, tripStart };
}

async function main(): Promise<void> {
  const { target, tripStart } = parseArgs();
  const events = buildEvents(tripStart);

  // createBroker also asserts the whole topology (exchange, queues, bindings),
  // so this script works against a brand-new RabbitMQ with no service running.
  const broker = await createBroker(defaultBrokerUrl());

  const jobs: Array<[string, string, unknown]> = [];
  if (target === "all" || target === "created") {
    jobs.push(["itinerary.created (confirmation + ~30s reminder)", ROUTING_KEYS.itineraryCreated, events.created]);
  }
  if (target === "all" || target === "shared") {
    jobs.push(["itinerary.shared (mail to each recipient)", ROUTING_KEYS.itineraryShared, events.shared]);
  }
  if (target === "all" || target === "invited") {
    jobs.push(["group.invited (invite mail)", ROUTING_KEYS.groupInvited, events.invited]);
  }

  for (const [description, routingKey, payload] of jobs) {
    await broker.publish(routingKey, payload);
    logger.info({ routingKey }, `published ${description}`);
  }

  await broker.close();
  console.log("\nDone — open Mailpit (http://localhost:8025) to watch the emails land.");
}

main().catch((error) => {
  logger.error({ err: error }, "publish-test-event failed — is RabbitMQ up? (docker compose up -d rabbitmq)");
  process.exit(1);
});
