/**
 * Isolate SDK library for the loader backend's compileAndTest.
 *
 * Bundled by `npm run build:harness` into loader-testing.bundle.txt and injected
 * as the "testing.js" module. The generated plugin's transpiled test.ts has its
 * `nginx-lint-plugin/testing` import rewritten to "./testing.js" so it resolves
 * here. Top-level await instantiates the parser once, so the exported
 * PluginTestRunner / parseConfig work synchronously inside the test.
 */
import { createTesting } from "nginx-lint-plugin/testing/custom";
import core from "./parser.core.wasm";

const { parseConfig, PluginTestRunner } = await createTesting({
  getCoreModule: () => core,
  instantiateCore: (module) => new WebAssembly.Instance(module),
});

export { parseConfig, PluginTestRunner };
