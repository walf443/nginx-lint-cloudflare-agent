/**
 * Worker Loader isolate entry (bundled by `npm run build:harness` into
 * loader-harness.bundle.txt, then injected as the "harness.js" module).
 *
 * Runs the untrusted generated plugin's check() against configs and returns
 * JSON. `./parser.core.wasm` and `./plugin.js` are kept external by esbuild —
 * the Worker Loader supplies them as isolate modules at runtime.
 */
import { createTesting } from "nginx-lint-plugin/testing/custom";
import core from "./parser.core.wasm";

let testingPromise;
function getTesting() {
  testingPromise ??= createTesting({
    getCoreModule: () => core,
    // The parser core has no imports, so a synchronous Instance keeps
    // parseConfig synchronous.
    instantiateCore: (module) => new WebAssembly.Instance(module),
  });
  return testingPromise;
}

export default {
  async fetch(req) {
    const { configs } = await req.json();
    const { PluginTestRunner } = await getTesting();

    // The generated plugin, provided as the "plugin.js" isolate module.
    const plugin = await import("./plugin.js");
    const runner = new PluginTestRunner(plugin.spec, plugin.check);

    const results = (configs ?? []).map((c) => {
      try {
        const errors = runner.checkString(c.content).map((e) => ({
          rule: e.rule,
          message: e.message,
          severity: e.severity,
          line: e.line,
          column: e.column,
          fixCount: (e.fixes || []).length,
        }));
        return { name: c.name, ok: true, errorCount: errors.length, errors };
      } catch (e) {
        return {
          name: c.name,
          ok: false,
          errorCount: 0,
          errors: [],
          error: e instanceof Error ? e.message : String(e),
        };
      }
    });

    return Response.json({ results });
  },
};
