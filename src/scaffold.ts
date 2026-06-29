/**
 * Templates for the throwaway npm project we materialize inside the sandbox
 * to compile and test a generated plugin.
 *
 * The verification relies entirely on the published `nginx-lint-plugin`
 * package, which ships the transpiled nginx parser wasm + the PluginTestRunner.
 * No `jco componentize` is needed for verification.
 */

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
        "nginx-lint-plugin": "latest",
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
