/**
 * Bundle the Worker Loader isolate modules into *.bundle.txt text assets that
 * the loader backend injects into dynamically-created isolates.
 *
 *   loader-harness.js  -> loader-harness.bundle.txt   (runConfigs isolate entry)
 *   loader-testing.js  -> loader-testing.bundle.txt   (compileAndTest SDK lib)
 *
 * `./parser.core.wasm`, `./plugin.js`, and node: builtins stay external — the
 * isolate provides the wasm + plugin as modules at runtime.
 */
import { build } from "esbuild";

const common = {
  bundle: true,
  format: "esm",
  platform: "neutral",
  logLevel: "warning",
};

await build({
  ...common,
  entryPoints: ["src/backends/loader-harness.js"],
  external: ["./parser.core.wasm", "./plugin.js", "node:*"],
  outfile: "src/backends/loader-harness.bundle.txt",
});

await build({
  ...common,
  entryPoints: ["src/backends/loader-testing.js"],
  external: ["./parser.core.wasm", "node:*"],
  outfile: "src/backends/loader-testing.bundle.txt",
});

console.log("built loader isolate bundles");
