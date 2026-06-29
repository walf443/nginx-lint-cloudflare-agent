/**
 * Worker Loader verification backend (WIP — container-free, no Paid plan).
 *
 * Instead of a container, this runs the generated plugin inside an isolated
 * Worker via the Worker Loader API (`env.LOADER.get(...)`). The plan:
 *
 *   1. Transpile the LLM-authored plugin.ts -> plugin.js (strip types) with a
 *      wasm transpiler (esbuild-wasm / @swc/wasm) bundled into the main Worker.
 *   2. Parse each config with the `nginx-lint-plugin` parser wasm IN THE MAIN
 *      (trusted) Worker, producing a plain ParseOutput. The wasm-runs-in-workerd
 *      question is the critical unknown to PoC first (see README/notes).
 *   3. env.LOADER.get(id, () => ({ modules: { 'harness.js', 'plugin.js' }, ... }))
 *      spins up an isolate with network disabled (globalOutbound: null); the
 *      harness rebuilds Config via buildConfigFromParseOutput and calls
 *      plugin.check(), returning LintErrors as JSON over fetch()/RPC.
 *
 * Only the untrusted plugin runs in the isolate; the parser stays in the main
 * Worker. Selecting this backend before the PoC lands fails fast with a clear
 * message rather than silently misbehaving.
 */

import type {
  CheckConfigsInput,
  CheckConfigsOutput,
  VerifyBackend,
  VerifyInput,
  VerifyResult,
} from "./types.js";

const NOT_READY =
  "loader backend is not implemented yet — the nginx parser wasm + " +
  "transpile-in-Worker PoC must land first. Use VERIFY_BACKEND=sandbox " +
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
