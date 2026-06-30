/**
 * Worker Loader verification backend (WIP — container-free, no Paid plan).
 *
 * Instead of a container, this runs the generated plugin inside an isolated
 * Worker via the Worker Loader API (`env.LOADER.get(...)`).
 *
 * Parser status: SOLVED. The published `nginx-lint-plugin` (>=0.14.0) exposes a
 * workerd-friendly entry, `nginx-lint-plugin/testing/custom`:
 *
 *   import { createTesting } from "nginx-lint-plugin/testing/custom";
 *   import coreModule from "nginx-lint-plugin/wasm/parser/parser.core.wasm";
 *   const { parseConfig, PluginTestRunner } = await createTesting({
 *     getCoreModule: () => coreModule,
 *     instantiateCore: (m) => new WebAssembly.Instance(m), // core has no imports
 *   });
 *
 * This parses configs and runs a plugin's check() entirely in-Worker (verified
 * in poc/). What remains is running the *untrusted* generated plugin safely:
 *
 *   1. Transpile the LLM-authored plugin.ts -> JS in-Worker (esbuild-wasm /
 *      @swc/wasm), since there is no tsc.
 *   2. env.LOADER.get(id, () => ({ modules: { 'harness.js', 'plugin.js', ... },
 *      globalOutbound: null })) spins up an isolate with network disabled. The
 *      harness imports nginx-lint-plugin/testing/custom + the transpiled plugin,
 *      runs PluginTestRunner.checkString over the configs, and returns LintErrors
 *      as JSON. The core wasm module is passed in to the isolate.
 *
 * Everything that touches the untrusted plugin runs in the isolate; only JSON
 * crosses back. Selecting this backend before that lands fails fast with a
 * clear message rather than silently misbehaving.
 */

import type {
  CheckConfigsInput,
  CheckConfigsOutput,
  VerifyBackend,
  VerifyInput,
  VerifyResult,
} from "./types.js";

const NOT_READY =
  "loader backend is not implemented yet — the parser runs in workerd via " +
  "nginx-lint-plugin/testing/custom (see poc/), but the transpile + Worker " +
  "Loader isolate step is still WIP. Use VERIFY_BACKEND=sandbox for now " +
  "(see src/backends/loader.ts for the plan).";

function assertLoaderBinding(env: Env): void {
  if (!("LOADER" in env) || !env.LOADER) {
    throw new Error(
      "no LOADER binding — add `worker_loaders` to your wrangler config " +
        "(see wrangler.loader.jsonc).",
    );
  }
}

async function compileAndTest(
  env: Env,
  _input: VerifyInput,
): Promise<VerifyResult> {
  assertLoaderBinding(env);
  throw new Error(NOT_READY);
}

async function runConfigs(
  env: Env,
  _input: CheckConfigsInput,
): Promise<CheckConfigsOutput> {
  assertLoaderBinding(env);
  return { results: [], error: NOT_READY };
}

export const loaderBackend: VerifyBackend = {
  name: "loader",
  compileAndTest,
  runConfigs,
};
