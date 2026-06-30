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

import { transform } from "sucrase";
import harnessSource from "./loader-harness.bundle.txt";
import coreWasm from "nginx-lint-plugin/wasm/parser/parser.core.wasm";
import type {
  CheckConfigsInput,
  CheckConfigsOutput,
  ConfigCheckResult,
  VerifyBackend,
  VerifyInput,
  VerifyResult,
} from "./types.js";

const COMPAT_DATE = "2026-06-28";

const COMPILE_NOT_READY =
  "loader backend's compileAndTest is not implemented yet — the model's " +
  "node:test-based test file can't run in an isolate. runConfigs (config " +
  "checking) works; for authoring use VERIFY_BACKEND=sandbox for now.";

function getLoader(env: Env): WorkerLoader {
  if (!("LOADER" in env) || !env.LOADER) {
    throw new Error(
      "no LOADER binding — add `worker_loaders` to your wrangler config " +
        "(see wrangler.loader.jsonc).",
    );
  }
  return env.LOADER;
}

/** Strip TypeScript from the generated plugin so it can run as a JS module. */
function transpilePlugin(pluginTs: string): string {
  return transform(pluginTs, {
    transforms: ["typescript"],
    disableESTransforms: true,
    production: true,
  }).code;
}

async function compileAndTest(
  env: Env,
  _input: VerifyInput,
): Promise<VerifyResult> {
  getLoader(env);
  throw new Error(COMPILE_NOT_READY);
}

async function runConfigs(
  env: Env,
  input: CheckConfigsInput,
): Promise<CheckConfigsOutput> {
  const loader = getLoader(env);

  let pluginJs: string;
  try {
    pluginJs = transpilePlugin(input.pluginTs);
  } catch (e) {
    return { results: [], error: `transpile failed: ${(e as Error).message}` };
  }

  // Spin up an isolate with the bundled SDK harness, the transpiled plugin, and
  // the parser core wasm. Network is disabled; only JSON crosses back.
  const stub = loader.get(`plugin-${input.pluginName}`, () => ({
    compatibilityDate: COMPAT_DATE,
    mainModule: "harness.js",
    modules: {
      "harness.js": harnessSource,
      "plugin.js": pluginJs,
      "parser.core.wasm": { wasm: coreWasm },
    },
    globalOutbound: null,
  }));

  let res: Response;
  try {
    res = await stub.getEntrypoint().fetch(
      new Request("http://isolate/", {
        method: "POST",
        body: JSON.stringify({ configs: input.configs }),
      }),
    );
  } catch (e) {
    return { results: [], error: `isolate failed: ${(e as Error).message}` };
  }

  if (!res.ok) {
    return {
      results: [],
      raw: (await res.text()).slice(0, 2000),
      error: `isolate returned ${res.status}`,
    };
  }

  const out = (await res.json()) as { results: ConfigCheckResult[] };
  return { results: out.results };
}

export const loaderBackend: VerifyBackend = {
  name: "loader",
  compileAndTest,
  runConfigs,
};
