/**
 * tokens.ts — opaque single-use tokens for invites and share links.
 *
 * `crypto.randomBytes` is enough here: the token is a capability ("whoever
 * holds it may join / view") that is always delivered alongside context
 * (email / share URL), never guessable in a brute-force window.
 */
import { randomBytes } from "crypto";

/** 24 random bytes → 48 hex chars — comfortable entropy, short enough for URLs. */
const TOKEN_BYTES = 24;

export function generateInviteToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

export function generateShareToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}
