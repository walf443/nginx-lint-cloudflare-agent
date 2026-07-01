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

function clean(src) {
  return src
    // drop the jco module banner
    .replace(/\/\*\* @module .*?\*\*\/\n?/g, "")
    // drop cross-file re-exports (`export type Foo = import('./x.js').Foo;`) —
    // every referenced type is already embedded from its own file
    .replace(/^export type \w+ = import\([^)]*\)\.\w+;\s*$/gm, "")
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

const out =
  `// GENERATED FILE — do not edit by hand.\n` +
  `// Produced by scripts/generate-prompt-api.mjs from nginx-lint-plugin@${version}.\n` +
  `// Rerun \`npm run generate:prompt\` after bumping the nginx-lint-plugin dependency.\n\n` +
  `export const PLUGIN_API_VERSION = ${JSON.stringify(version)};\n\n` +
  `export const PLUGIN_API = ${JSON.stringify(apiTypes)};\n`;

writeFileSync("src/plugin-api.generated.ts", out);
console.log(
  `wrote src/plugin-api.generated.ts (${apiTypes.length} chars, nginx-lint-plugin@${version})`,
);
