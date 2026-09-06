import {
  GroupInvitedEvent,
  ItineraryCreatedEvent,
  ItinerarySharedEvent,
  env,
} from "@smart/shared/src/server";

/**
 * HTML + plain-text templates for the four notification emails (diagram:
 * "Email Service"). Kept as pure functions event → subject/html/text so the
 * handlers in handlers.ts stay thin and the copy is reviewable in one place.
 *
 * Inline styles only: most email clients (and Mailpit's HTML preview) strip
 * <style> blocks, so styling lives on the elements themselves.
 */

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

/** Base URL for links inside emails; the web app owns the actual pages. */
function webAppUrl(): string {
  return env("WEB_APP_URL", "http://localhost:3000");
}

/**
 * Event payloads (destination, names, emails) originate from user input and
 * flow unmodified through RabbitMQ — escape everything before it enters the
 * HTML body so an itinerary named "<script>" stays inert.
 */
function escapeHtml(value: string): string {
  const escapes: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return value.replace(/[&<>"']/g, (character) => escapes[character]);
}

/**
 * Render a trip date for humans. Event dates may be "2026-10-01" or a full
 * ISO timestamp (the shared schema only requires ≥ 8 chars); fall back to the
 * raw string when unparseable rather than sending "Invalid Date" to a user.
 */
function formatTripDate(dateish: string): string {
  const parsed = new Date(dateish);
  if (Number.isNaN(parsed.getTime())) return dateish;
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(parsed);
}

/** Minimal email shell: a centered card with heading, body and a footnote. */
function pageShell(heading: string, bodyHtml: string, footnote: string): string {
  return [
    "<!doctype html>",
    '<html><body style="margin:0;padding:24px;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">',
    '  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:8px;padding:28px;">',
    `    <h1 style="margin:0 0 16px;font-size:20px;color:#1a1a1a;">${heading}</h1>`,
    bodyHtml,
    `    <p style="margin:24px 0 0;font-size:12px;color:#8a8f98;">${footnote}</p>`,
    "  </div>",
    "</body></html>",
  ].join("\n");
}

/** Link styled as a button — the one interactive element these emails use. */
function linkButton(href: string, label: string): string {
  return (
    `<p style="margin:20px 0;">` +
    `<a href="${escapeHtml(href)}" style="display:inline-block;background:#2563eb;color:#ffffff;` +
    `padding:10px 18px;border-radius:6px;text-decoration:none;font-size:14px;">${label}</a></p>`
  );
}

/**
 * Confirmation for itinerary.created — sent to the trip owner right after a
 * save. Also sets expectations for the 24h-before-start reminder.
 */
export function itineraryCreatedEmail(event: ItineraryCreatedEvent): EmailContent {
  const destination = escapeHtml(event.destination);
  const start = escapeHtml(formatTripDate(event.startDate));
  const end = escapeHtml(formatTripDate(event.endDate));
  return {
    subject: `Trip saved: ${event.destination} (${formatTripDate(event.startDate)})`,
    html: pageShell(
      `${destination} is on the books!`,
      `<p style="margin:0 0 12px;color:#3a3f45;font-size:14px;line-height:1.6;">` +
        `Your trip to <strong>${destination}</strong> has been saved` +
        ` (${start} &rarr; ${end}).`,
      `We'll email you one reminder, 24 hours before your trip starts.`,
    ),
    text:
      `Your trip to ${event.destination} has been saved ` +
      `(${formatTripDate(event.startDate)} to ${formatTripDate(event.endDate)}). ` +
      `We'll email you one reminder, 24 hours before your trip starts.`,
  };
}

/** Reminder for email.reminder.due — fires ~24h before the trip starts. */
export function reminderDueEmail(event: ItineraryCreatedEvent): EmailContent {
  const destination = escapeHtml(event.destination);
  const start = escapeHtml(formatTripDate(event.startDate));
  const end = escapeHtml(formatTripDate(event.endDate));
  return {
    subject: `Reminder: your trip to ${event.destination} starts ${formatTripDate(event.startDate)}`,
    html: pageShell(
      `${destination} is almost here!`,
      `<p style="margin:0 0 12px;color:#3a3f45;font-size:14px;line-height:1.6;">` +
        `Your trip starts on <strong>${start}</strong> and runs to ${end}. ` +
        `Time to check passports, bookings and packing lists.`,
      `You are receiving this because you saved this trip on Smart Itinerary.`,
    ),
    text:
      `Reminder: your trip to ${event.destination} starts on ` +
      `${formatTripDate(event.startDate)} (ends ${formatTripDate(event.endDate)}).`,
  };
}

/**
 * Notification for itinerary.shared — one copy per recipient (the handler
 * calls this once per address in recipientEmails).
 */
export function itinerarySharedEmail(
  event: ItinerarySharedEvent,
  recipientEmail: string
): EmailContent {
  // Read-only view page shipped with the tools-service work (T2.5).
  const link = `${webAppUrl()}/shared/${event.shareToken}`;
  const destination = event.destination
    ? `a trip to ${escapeHtml(event.destination)}`
    : "a trip itinerary";
  return {
    subject: `${event.sharedByEmail} shared an itinerary with you`,
    html: pageShell(
      `An itinerary was shared with you`,
      `<p style="margin:0 0 12px;color:#3a3f45;font-size:14px;line-height:1.6;">` +
        `<strong>${escapeHtml(event.sharedByEmail)}</strong> shared ${destination} with ` +
        `<strong>${escapeHtml(recipientEmail)}</strong>.` +
        linkButton(link, "View the itinerary"),
      `The link opens a read-only view — you don't need an account to look.`,
    ),
    text:
      `${event.sharedByEmail} shared ${destination} with you. View it here: ${link}`,
  };
}

/**
 * Invitation for group.invited — the token is what the invited person
 * redeems to join. Route owned by the tools-service / Tools UI work (T1.6 +
 * T2.5); if that lands under a different path only this file changes.
 */
export function groupInvitedEmail(event: GroupInvitedEvent): EmailContent {
  const link = `${webAppUrl()}/groups/join/${event.inviteToken}`;
  return {
    subject: `${event.invitedByEmail} invited you to join ${event.groupName}`,
    html: pageShell(
      `You're invited to ${escapeHtml(event.groupName)}`,
      `<p style="margin:0 0 12px;color:#3a3f45;font-size:14px;line-height:1.6;">` +
        `<strong>${escapeHtml(event.invitedByEmail)}</strong> invited you to join the group ` +
        `<strong>${escapeHtml(event.groupName)}</strong> on Smart Itinerary.` +
        linkButton(link, "Join the group"),
      `This invite link is personal to ${escapeHtml(event.email)}.`,
    ),
    text:
      `${event.invitedByEmail} invited you to join the group ${event.groupName}. ` +
      `Join here: ${link}`,
  };
}
