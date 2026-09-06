/**
 * @smart/shared — the SERVER entry: everything the root barrel exports, plus
 * the infrastructure adapters.
 *
 * The root barrel (./index.ts) is browser-safe by design — see its header for
 * why the adapters cannot live there. Node processes import this entry
 * instead and get one import site for every shared symbol, contracts and
 * adapters alike:
 *
 *   import { MeResponseSchema, createLogger } from "@smart/shared/src/server";
 *
 * This is a runtime distinction, not a typing one — importing this entry from
 * browser code would break the bundle exactly like the old monolithic barrel
 * did.
 */

export * from "./index";

export * from "./adapters/config";
export * from "./adapters/db";
export * from "./adapters/storage";
export * from "./adapters/mailer";
export * from "./adapters/broker";
export * from "./adapters/jwt";
export * from "./adapters/http";
