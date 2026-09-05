import {
  Broker,
  GroupInvitedEvent,
  GroupInvitedEventSchema,
  ItinerarySharedEvent,
  ItinerarySharedEventSchema,
  ROUTING_KEYS,
  createBroker,
  createLogger,
  defaultBrokerUrl,
} from "@smart/shared";

/**
 * Publishes the two events this service owns on the RabbitMQ topic exchange
 * (diagram: "Message Broker — RabbitMQ"). The email-service consumes both on
 * the `email.events` queue:
 *
 *   group.invited    — an invite email with the join link (invite token)
 *   itinerary.shared — a share notification with the read-only link
 *
 * RabbitMQ being down must never fail an invite/share: the connection is
 * created lazily on first publish and re-attempted after every failure, and
 * any publish problem is logged, not thrown. (Same resilient pattern the
 * itinerary-service uses for `itinerary.created`.)
 */

const logger = createLogger("tools-service");

/** In-flight (or completed) createBroker attempt; null = connect again. */
let brokerAttempt: Promise<Broker | null> | null = null;
/** The live connection, kept only for clean shutdown. */
let connectedBroker: Broker | null = null;

function connectBroker(): Promise<Broker | null> {
  brokerAttempt = createBroker(defaultBrokerUrl())
    .then((broker) => {
      connectedBroker = broker;
      return broker;
    })
    .catch((error) => {
      // Forget the failed attempt so the NEXT publish retries the connection
      // instead of caching the failure forever.
      brokerAttempt = null;
      logger.error(
        { err: error },
        "RabbitMQ unavailable — invite/share notifications are dropped until it is reachable again"
      );
      return null;
    });
  return brokerAttempt;
}

/**
 * Shared body of both publishers: validate against the shared event schema
 * (keeps malformed payloads out of the broker), connect lazily, publish.
 * Every failure lands in the logs; nothing propagates to the HTTP route.
 */
async function publishEvent(routingKey: string, event: unknown, context: object): Promise<void> {
  try {
    const broker = (await brokerAttempt) ?? (await connectBroker());
    if (!broker) return; // already logged by connectBroker
    await broker.publish(routingKey, event);
    logger.info({ routingKey, ...context }, `${routingKey} published`);
  } catch (error) {
    logger.error({ err: error, routingKey, ...context }, `failed to publish ${routingKey}`);
  }
}

/** Notify one invitee that they were invited (carries the join token). */
export function publishGroupInvited(event: GroupInvitedEvent): Promise<void> {
  const payload = GroupInvitedEventSchema.parse(event);
  return publishEvent(ROUTING_KEYS.groupInvited, payload, {
    groupId: payload.groupId,
    email: payload.email,
  });
}

/** Notify an audience that an itinerary was shared with them. */
export function publishItineraryShared(event: ItinerarySharedEvent): Promise<void> {
  const payload = ItinerarySharedEventSchema.parse(event);
  return publishEvent(ROUTING_KEYS.itineraryShared, payload, {
    itineraryId: payload.itineraryId,
    recipients: payload.recipientEmails.length,
  });
}

export interface EventPublisher {
  groupInvited(event: GroupInvitedEvent): Promise<void>;
  itineraryShared(event: ItinerarySharedEvent): Promise<void>;
}

/** Small object form so routes get their dependencies injected, not imports. */
export function createEventPublisher(): EventPublisher {
  return {
    groupInvited: publishGroupInvited,
    itineraryShared: publishItineraryShared,
  };
}

/** Graceful shutdown: close the broker only if we actually connected. */
export async function closeBroker(): Promise<void> {
  if (connectedBroker) {
    await connectedBroker.close().catch((error) =>
      logger.warn({ err: error }, "broker close failed during shutdown")
    );
    connectedBroker = null;
    brokerAttempt = null;
  }
}
