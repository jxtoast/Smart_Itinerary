import {
  Broker,
  ItineraryCreatedEvent,
  ItineraryCreatedEventSchema,
  ROUTING_KEYS,
  createBroker,
  createLogger,
  defaultBrokerUrl,
} from "@smart/shared/src/server";

/**
 * Publishes the `itinerary.created` event (diagram: "Message Broker —
 * RabbitMQ") after a successful itinerary save. The email-service consumes it
 * on the `email.events` queue to send the trip confirmation + schedule the
 * reminder.
 *
 * RabbitMQ being down must never fail a save: the connection is created
 * lazily on first publish and re-attempted after every failure, and any
 * publish problem is logged, not thrown.
 */

const logger = createLogger("itinerary-service");

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
        "RabbitMQ unavailable — itinerary.created events are dropped until it is reachable again"
      );
      return null;
    });
  return brokerAttempt;
}

/**
 * Fire after a successful save (never before it commits — consumers must not
 * read an itinerary that does not exist yet). Validating our own event with
 * the shared schema keeps a malformed payload out of the broker; a validation
 * failure lands in the logs like any other publish problem.
 */
export async function publishItineraryCreated(event: ItineraryCreatedEvent): Promise<void> {
  try {
    const payload = ItineraryCreatedEventSchema.parse(event);
    const broker = (await brokerAttempt) ?? (await connectBroker());
    if (!broker) return; // already logged by connectBroker
    await broker.publish(ROUTING_KEYS.itineraryCreated, payload);
    logger.info(
      { itineraryId: payload.itineraryId, routingKey: ROUTING_KEYS.itineraryCreated },
      "itinerary.created published"
    );
  } catch (error) {
    logger.error(
      { err: error, itineraryId: event.itineraryId },
      "failed to publish itinerary.created — the itinerary save is unaffected"
    );
  }
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
