/**
 * Backend selection. Both backends are bound in wrangler.jsonc (containers +
 * worker_loaders), so either can be chosen per request — pass `backend` in the
 * request body to compare them. When a request omits it, the `VERIFY_BACKEND`
 * var is the default.
 *
 *   "sandbox" -> container-based (Cloudflare Sandbox).
 *   "loader"  -> Worker Loader isolate, no container.
 *
 * Both require the Workers Paid plan to deploy.
 */

import { loaderBackend } from "./loader.js";
import { sandboxBackend } from "./sandbox.js";
import type { VerifyBackend } from "./types.js";

export const BACKENDS = ["sandbox", "loader"] as const;
export type BackendName = (typeof BACKENDS)[number];

/**
 * Pick a backend by explicit `choice` (per request), falling back to the
 * `VERIFY_BACKEND` var, then to "sandbox".
 */
export function getBackend(env: Env, choice?: string): VerifyBackend {
  const name = choice || env.VERIFY_BACKEND || "sandbox";
  switch (name) {
    case "loader":
      return loaderBackend;
    case "sandbox":
      return sandboxBackend;
    default:
      throw new Error(`unknown backend: ${name} (expected sandbox|loader)`);
  }
}

export type { VerifyBackend } from "./types.js";
