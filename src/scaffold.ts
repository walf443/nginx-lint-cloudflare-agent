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
 */
export function pluginProjectPackageJson(name: string): string {
  return JSON.stringify(
    {
      name,
      version: "0.0.0",
      type: "module",
      scripts: {
        build:
          "tsc && jco componentize dist/plugin.js " +
          "-w node_modules/nginx-lint-plugin/wit -n plugin --disable all " +
          `-o dist/${name}.wasm`,
        test: "tsc && node --test dist/plugin.test.js",
      },
      dependencies: {
        "nginx-lint-plugin": PLUGIN_API_VERSION,
      },
      devDependencies: {
        "@bytecodealliance/componentize-js": "^0.19",
        "@bytecodealliance/jco": "^1",
        "@types/node": "^22.0.0",
        typescript: "^5.6.0",
      },
    },
    null,
    2,
  );
}

export const TSCONFIG = JSON.stringify(
  {
    compilerOptions: {
      target: "es2022",
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
