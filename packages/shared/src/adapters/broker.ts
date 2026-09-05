import amqp, { Channel, ChannelModel, Options, Replies } from "amqplib";
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
 * Resilience: the connection is supervised. A RabbitMQ restart mid-session no
 * longer leaves consumers silently dead — the adapter notices the loss, flips
 * its status to "retrying" (optionally reported via the `onStatus` callback),
 * and reconnects with bounded backoff, re-asserting the topology and replaying
 * every consume() registration on the new connection. Existing single-arg
 * callers are unaffected; pass `{ onStatus }` to observe the transitions.
 *
 * Note: RabbitMQ expires per-message TTLs from the head of the queue, so a
 * long delay ahead of a short one delays it further — acceptable for this
 * workload (demo reminders).
 *
 * AWS swap: AMQP_URL -> Amazon MQ (RabbitMQ endpoint); topology identical.
 */

const logger = createLogger("broker");

/** Connection health, reported to callers through the `onStatus` callback. */
export type BrokerStatus = "connecting" | "connected" | "retrying";

export interface BrokerOptions {
  /**
   * Called on every connection-state change (status starts at "connecting";
   * only transitions are reported). email-service mirrors this into /healthz.
   * A throwing callback is logged, never propagated — it must not be able to
   * kill the reconnect loop.
   */
  onStatus?: (status: BrokerStatus) => void;
}

/**
 * Reconnect backoff: 1s, 2s, 4s, … capped at 30s so a long outage retries
 * forever without the delay growing unbounded (bounded backoff).
 */
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

/** One consume() registration, kept so a reconnect can replay it verbatim. */
interface ConsumerRegistration {
  queue: string;
  handler: (payload: unknown, msg: amqp.ConsumeMessage) => Promise<void>;
  routingPatterns?: string[];
}

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

export async function createBroker(
  urlOverride?: string,
  options: BrokerOptions = {}
): Promise<Broker> {
  const url = urlOverride ?? requireEnv("AMQP_URL");
  const { onStatus } = options;

  // --- connection state (one closure per broker instance) ---
  let connection: ChannelModel | null = null;
  let channel: Channel | null = null;
  /** Consumers from consume(); replayed in order after every reconnect. */
  const consumers: ConsumerRegistration[] = [];
  /** True while a reconnect attempt is in flight (dedupes reconnect loops). */
  let establishing = false;
  /** Pending backoff timer, non-null ⟺ exactly one reconnect is scheduled. */
  let reconnectTimer: NodeJS.Timeout | null = null;
  /** Failed reconnect attempts in a row — drives the backoff, reset on success. */
  let reconnectAttempt = 0;
  /** Set by close() so the reconnect loop never fights a deliberate shutdown. */
  let shutDown = false;
  /** Last status handed to onStatus (transitions only, starts "connecting"). */
  let currentStatus: BrokerStatus = "connecting";

  function setStatus(next: BrokerStatus): void {
    if (next === currentStatus) return;
    currentStatus = next;
    try {
      onStatus?.(next);
    } catch (error) {
      logger.error({ err: error }, "broker onStatus callback threw — ignored");
    }
  }

  /** Idempotent topology assert — runs on first connect and after every reconnect. */
  async function assertEventTopology(ch: Channel): Promise<void> {
    await ch.assertExchange(EVENT_EXCHANGE, "topic", { durable: true });

    // Reminder scheduling via native message-TTL + dead-lettering.
    await ch.assertQueue(QUEUES.remindersWaiting, {
      durable: true,
      arguments: {
        "x-dead-letter-exchange": EVENT_EXCHANGE,
        "x-dead-letter-routing-key": ROUTING_KEYS.reminderDue,
      } as Options.AssertQueue["arguments"],
    });
    await ch.assertQueue(QUEUES.remindersDue, { durable: true });
    await ch.bindQueue(QUEUES.remindersDue, EVENT_EXCHANGE, ROUTING_KEYS.reminderDue);
    await ch.assertQueue(QUEUES.emailEvents, { durable: true });
    await ch.bindQueue(QUEUES.emailEvents, EVENT_EXCHANGE, "itinerary.*");
    await ch.bindQueue(QUEUES.emailEvents, EVENT_EXCHANGE, "group.*");
  }

  /**
   * ack/nack can race a broker restart (the channel dies under us); swallowing
   * that here keeps the process alive — the unacked message is simply
   * redelivered by RabbitMQ once the adapter reconnects (at-least-once).
   */
  function safeAck(ack: () => void, queue: string): void {
    try {
      ack();
    } catch (error) {
      logger.warn(
        { err: error, queue },
        "ack failed — connection is gone; message will be redelivered after reconnect"
      );
    }
  }

  /** Assert queue + bindings and start one consumer on the given live channel. */
  async function startConsumer(
    ch: Channel,
    registration: ConsumerRegistration
  ): Promise<Replies.Consume> {
    const { queue, handler, routingPatterns } = registration;
    await ch.assertQueue(queue, { durable: true });
    for (const pattern of routingPatterns ?? []) {
      await ch.bindQueue(queue, EVENT_EXCHANGE, pattern);
    }
    return ch.consume(queue, (msg) => {
      if (!msg) return;
      void (async () => {
        try {
          const payload = JSON.parse(msg.content.toString());
          await handler(payload, msg);
          safeAck(() => ch.ack(msg), queue);
        } catch (error) {
          // One retry (re-queue on first delivery); drop poison messages.
          if (!msg.fields.redelivered) {
            safeAck(() => ch.nack(msg, false, true), queue);
          } else {
            logger.error({ err: error, queue }, "poison message dropped");
            safeAck(() => ch.ack(msg), queue);
          }
        }
      })();
    });
  }

  /**
   * Connect, assert the topology and replay every registered consumer. With
   * initial=true a failure is thrown to the caller (startup retry loops belong
   * to the services — email-service retries forever); with initial=false a
   * failure schedules the next backoff attempt instead.
   */
  async function establish(initial: boolean): Promise<void> {
    establishing = true;
    // Error/close handlers go on BEFORE anything else: amqplib surfaces socket
    // loss as connection 'error', and an unhandled 'error' event would crash
    // the whole process (the exact failure mode this adapter exists to fix).
    let pendingConnection: ChannelModel | null = null;
    try {
      setStatus("connecting");
      pendingConnection = await amqp.connect(url);
      if (shutDown) {
        // close() landed while this attempt was in flight — don't leave a
        // fresh live connection behind on a broker that was closed.
        await pendingConnection.close().catch(() => {});
        establishing = false;
        return;
      }
      pendingConnection.on("error", (error) =>
        logger.error({ err: error }, "RabbitMQ connection error")
      );
      pendingConnection.on("close", () => onConnectionGone());

      const ch = await pendingConnection.createChannel();
      ch.on("error", (error) =>
        logger.error(
          { err: error },
          "RabbitMQ channel error — consumers on this channel stop until the connection itself is re-established"
        )
      );
      await assertEventTopology(ch);
      for (const registration of consumers) {
        await startConsumer(ch, registration);
      }

      connection = pendingConnection;
      channel = ch;
      establishing = false;
      reconnectAttempt = 0;
      setStatus("connected");
      logger.info(
        { consumers: consumers.length },
        "RabbitMQ connected — topology asserted, consumers live"
      );
    } catch (error) {
      establishing = false;
      // Release the half-open connection so the next attempt starts clean.
      if (pendingConnection) {
        await pendingConnection.close().catch(() => {});
      }
      if (initial) throw error;
      logger.warn(
        { err: error, attempt: reconnectAttempt + 1 },
        "RabbitMQ reconnect attempt failed"
      );
      scheduleReconnect();
    }
  }

  /** Connection loss callback ('close' fires for restarts AND socket death). */
  function onConnectionGone(): void {
    // The old socket objects are dead — drop the references so publish/consume
    // fail honestly instead of writing into a closed channel.
    connection = null;
    channel = null;
    if (shutDown || establishing || reconnectTimer !== null) return;
    scheduleReconnect();
  }

  /** One bounded-backoff reconnect attempt; repeated until close() or success. */
  function scheduleReconnect(): void {
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempt, RECONNECT_MAX_MS);
    reconnectAttempt += 1;
    setStatus("retrying");
    logger.warn(
      { attempt: reconnectAttempt, delayMs: delay },
      "RabbitMQ connection lost — reconnect scheduled"
    );
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void establish(false);
    }, delay);
    // Never hold a process hostage for a background retry: services stay alive
    // via their HTTP servers, scripts close() explicitly.
    reconnectTimer.unref();
  }

  await establish(true);

  return {
    async publish(routingKey, payload) {
      const ch = channel;
      if (!ch) {
        // Disconnected window (startup failure or mid-reconnect). Fail soft
        // exactly as before the reconnect work: a throw that every caller
        // already catches and logs. We deliberately do NOT buffer messages
        // here — an unbounded buffer grows forever during a long outage and
        // thundering-herds the exchange on reconnect; events are best-effort
        // notifications, so dropping (with a log) is the honest tradeoff.
        throw new Error(`publish(${routingKey}) failed: RabbitMQ disconnected`);
      }
      ch.publish(EVENT_EXCHANGE, routingKey, Buffer.from(JSON.stringify(payload)), {
        contentType: "application/json",
        persistent: true,
      });
    },

    async scheduleReminder(event, startDate) {
      const parsed = ItineraryCreatedEventSchema.parse(event);
      const ttlMs = reminderDelayMs(startDate);
      const ch = channel;
      if (!ch) {
        // Same fail-soft contract as publish(): throw into the caller's
        // existing retry handling. For the email handler that means the
        // itinerary.created message is nack-requeued and reprocessed after
        // reconnect — the reminder is delayed, not lost. No buffering, for
        // the same outage-length reasons as publish().
        throw new Error(
          `scheduleReminder(itineraryId=${parsed.itineraryId}) failed: RabbitMQ disconnected`
        );
      }
      // Direct publish to the holding queue (default exchange); TTL expiry
      // dead-letters the message onto si.events / email.reminder.due.
      ch.sendToQueue(QUEUES.remindersWaiting, Buffer.from(JSON.stringify(parsed)), {
        contentType: "application/json",
        persistent: true,
        expiration: String(ttlMs),
      });
      logger.info({ itineraryId: parsed.itineraryId, ttlMs }, "reminder scheduled");
    },

    async consume(queue, handler, routingPatterns) {
      const ch = channel;
      if (!ch) {
        // Refuse rather than half-register: the registry must only ever hold
        // consumers that are actually consuming, or a reconnect would replay
        // duplicates. Callers recover by reconnecting from scratch (the same
        // startup-retry loop that handles a failed first connect).
        throw new Error(`consume(${queue}) failed: RabbitMQ disconnected`);
      }
      const registration: ConsumerRegistration = { queue, handler, routingPatterns };
      const reply = await startConsumer(ch, registration);
      // Registered only once actually consuming — replay-safe.
      consumers.push(registration);
      return reply;
    },

    async close() {
      shutDown = true;
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      // Best-effort: either side may already be dead when we are called.
      if (channel) await channel.close().catch(() => {});
      if (connection) await connection.close().catch(() => {});
      connection = null;
      channel = null;
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
