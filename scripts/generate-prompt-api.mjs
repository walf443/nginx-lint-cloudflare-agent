/**
 * Generate src/plugin-api.generated.ts from the installed nginx-lint-plugin
 * type declarations, so the system prompt's API reference follows the SDK
 * automatically (bump the dep + rerun this, instead of hand-editing prompt.ts).
 *
 * Run via `npm run generate:prompt` (also chained into dev/deploy).
 */
import { readFileSync, writeFileSync } from "node:fs";

const PKG = "node_modules/nginx-lint-plugin";
const IFACE = `${PKG}/dist/generated/interfaces`;

// Order matters for readability: leaf types first, then the Config/Directive API.
const FILES = [
  "nginx-lint-plugin-types.d.ts", // Severity, Fix, LintError, PluginSpec
  "nginx-lint-plugin-data-types.d.ts", // ArgumentInfo, DirectiveData, ...
  "nginx-lint-plugin-config-api.d.ts", // Config, Directive, ConfigItem, ...
];

/** `./nginx-lint-plugin-x.js` -> `nginx-lint-plugin-x.d.ts` (a FILES entry). */
function declFileFor(modulePath) {
  return modulePath.replace(/^\.\//, "").replace(/\.js$/, ".d.ts");
}

function clean(src) {
  return src
    // drop the jco module banner
    .replace(/\/\*\* @module .*?\*\*\/\n?/g, "")
    // Cross-file re-exports (`export type Foo = import('./x.js').Bar;`). When
    // x.js is embedded below, drop the line — Bar is already declared there.
    // When it is not, the alias would dangle (`FlatItem` points into
    // parser-types, which we deliberately don't embed: its ConfigItem /
    // DirectiveContext would collide with the differently-shaped ones in
    // config-api). Keep such a name alive as an opaque type — a snapshot is a
    // token to hand back to buildConfigFromSnapshot, never something to walk.
    .replace(
      /^export type (\w+) = import\((['"])([^'"]+)\2\)\.\w+;\s*$/gm,
      (_line, alias, _quote, modulePath) =>
        FILES.includes(declFileFor(modulePath))
          ? ""
          : `/** Opaque SDK internal — never construct or walk one by hand. */\n` +
            `export type ${alias} = unknown;`,
    )
    // `import('./x.js').Foo` -> `Foo` for any remaining inline references
    .replace(/import\((['"])[^'"]+\1\)\./g, "")
    // drop the noisy synthetic "private constructor" blocks
    .replace(
      /\s*\/\*\*\s*\n\s*\* This type does not have a public constructor\.\s*\n\s*\*\/\s*\n\s*private constructor\(\);/g,
      "",
    )
    // collapse the blank lines left by the removals
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const apiTypes = FILES.map((f) => clean(readFileSync(`${IFACE}/${f}`, "utf8"))).join(
  "\n\n",
);

const version = JSON.parse(readFileSync(`${PKG}/package.json`, "utf8")).version;

// The SDK's API_VERSION ("1.2") — the value a plugin must put in
// PluginSpec.apiVersion. Read it from the SDK so it tracks the dependency, and
// inline it into the prompt as a literal: the SDK exports it as a runtime
// const, but plugins hardcode the string rather than import it (see prompt.ts).
const specApiVersion = readFileSync(`${PKG}/dist/index.d.ts`, "utf8").match(
  /export declare const API_VERSION = "([^"]+)"/,
)?.[1];
if (!specApiVersion) {
  throw new Error(
    `could not read API_VERSION from ${PKG}/dist/index.d.ts — ` +
      `the SDK's export shape changed; update this script.`,
  );
}

const out =
  `// GENERATED FILE — do not edit by hand.\n` +
  `// Produced by scripts/generate-prompt-api.mjs from nginx-lint-plugin@${version}.\n` +
  `// Rerun \`npm run generate:prompt\` after bumping the nginx-lint-plugin dependency.\n\n` +
  `export const PLUGIN_API_VERSION = ${JSON.stringify(version)};\n\n` +
  `/** The SDK's API_VERSION — the literal a plugin's spec().apiVersion must use. */\n` +
  `export const PLUGIN_SPEC_API_VERSION = ${JSON.stringify(specApiVersion)};\n\n` +
  `export const PLUGIN_API = ${JSON.stringify(apiTypes)};\n`;

writeFileSync("src/plugin-api.generated.ts", out);
console.log(
  `wrote src/plugin-api.generated.ts (${apiTypes.length} chars, ` +
    `nginx-lint-plugin@${version}, spec apiVersion ${specApiVersion})`,
);
