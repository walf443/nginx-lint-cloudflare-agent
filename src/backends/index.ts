/**
 * Backend selection. Controlled by the `VERIFY_BACKEND` var in wrangler config:
 *
 *   "sandbox" (default) -> container-based, requires the Workers Paid plan.
 *   "loader"            -> Worker Loader isolate, no container (WIP).
 *
 * Switch by deploying a different config (see wrangler.jsonc vs
 * wrangler.loader.jsonc) — the binding set differs per backend, so the toggle
 * lives in the build/config, not just at runtime.
 */

import { loaderBackend } from "./loader.js";
import { sandboxBackend } from "./sandbox.js";
import type { VerifyBackend } from "./types.js";

export function getBackend(env: Env): VerifyBackend {
  switch (env.VERIFY_BACKEND) {
    case "loader":
      return loaderBackend;
    case "sandbox":
    case undefined:
    case "":
      return sandboxBackend;
    default:
      throw new Error(`unknown VERIFY_BACKEND: ${env.VERIFY_BACKEND}`);
  }
}

export type { VerifyBackend } from "./types.js";
