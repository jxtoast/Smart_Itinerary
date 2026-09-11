/** Small env helpers so every adapter reads configuration the same way. */

export function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  return value ?? "";
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function isTruthy(name: string): boolean {
  return ["1", "true", "yes", "on"].includes(
    (process.env[name] ?? "").toLowerCase()
  );
}
