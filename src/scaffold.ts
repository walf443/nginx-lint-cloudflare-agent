/**
 * Templates for the throwaway npm project we materialize inside the sandbox
 * to compile and test a generated plugin.
 *
 * The verification relies entirely on the published `nginx-lint-plugin`
 * package, which ships the transpiled nginx parser wasm + the PluginTestRunner.
 * No `jco componentize` is needed for verification.
 */

import { PLUGIN_API_VERSION } from "./plugin-api.generated.js";

export function packageJson(name: string): string {
  return JSON.stringify(
    {
      name,
      version: "0.0.0",
      type: "module",
      scripts: {
        test: "tsc && node --test dist/plugin.test.js",
      },
      dependencies: {
        // Pin to the same SDK version the system prompt's API was generated
        // from, so the prompt, verification, and emitted project all agree.
        "nginx-lint-plugin": PLUGIN_API_VERSION,
      },
      devDependencies: {
        "@types/node": "^22.0.0",
        typescript: "^5.6.0",
      },
    },
    null,
    2,
  );
}

/**
 * A complete, build-ready plugin project package.json for the emitted output —
 * so a user can copy the files and run `npm install && npm run build` to produce
 * the .wasm component (plus `npm test` to verify). This mirrors the canonical
 * plugin setup in the nginx-lint-plugin README; it is heavier than the lean
 * `packageJson` above (which is used only for in-sandbox verification, where the
 * componentize toolchain isn't needed).
 *
 * The build bundles before componentizing. Plugins import `buildConfigFromSnapshot`
 * from the SDK at runtime, and `jco componentize`'s bundler (StarlingMonkey/wizer)
 * resolves no module specifier at all — it needs one self-contained file, so the
 * raw per-file tsc output would fail with "No such file or directory" even though
 * tsc and node resolve the same import fine. esbuild flattens it away first.
 */
export function pluginProjectPackageJson(name: string): string {
  return JSON.stringify(
    {
      name,
      version: "0.0.0",
      type: "module",
      scripts: {
        build:
          "tsc && npm run bundle && jco componentize dist/plugin.bundle.js " +
          "-w node_modules/nginx-lint-plugin/wit -n plugin --disable all " +
          `-o dist/${name}.wasm`,
        bundle:
          "esbuild dist/plugin.js --bundle --format=esm --platform=neutral " +
          "--outfile=dist/plugin.bundle.js",
        test: "tsc && node --test dist/plugin.test.js",
      },
      dependencies: {
        "nginx-lint-plugin": PLUGIN_API_VERSION,
      },
      devDependencies: {
        "@bytecodealliance/componentize-js": "^0.21.0",
        "@bytecodealliance/jco": "^1",
        "@types/node": "^22.0.0",
        esbuild: "^0.28.1",
        typescript: "^5.6.0",
      },
    },
    null,
    2,
  );
}

/**
 * tsconfig for both the in-sandbox verification project and the emitted one.
 *
 * `target` picks the default `lib` here rather than any downleveling — tsc emits
 * byte-identical JS for plugin code at es2022 and es2024, since neither ES2023
 * nor ES2024 added syntax tsc transforms. es2024 is really about letting the
 * model use the newer built-ins (findLast/toSorted, Object.groupBy,
 * Promise.withResolvers); every runtime a plugin lands in — the sandbox's Node,
 * workerd, and the SpiderMonkey that `jco componentize` bakes into the .wasm —
 * has had those since well before the toolchain versions pinned above.
 */
export const TSCONFIG = JSON.stringify(
  {
    compilerOptions: {
      target: "es2024",
      module: "nodenext",
      moduleResolution: "nodenext",
      outDir: "dist",
      rootDir: "src",
      strict: true,
      skipLibCheck: true,
    },
    include: ["src/**/*.ts"],
  },
  null,
  2,
);
