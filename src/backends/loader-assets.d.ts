// Module shapes for the non-JS assets the loader backend imports, matched to
// the wrangler module rules in wrangler.loader.jsonc:
//   - the esbuild-bundled harness, loaded as Text (a string)
//   - the parser core wasm, loaded as Data (an ArrayBuffer)

declare module "*.bundle.txt" {
  const source: string;
  export default source;
}

declare module "nginx-lint-plugin/wasm/parser/parser.core.wasm" {
  const data: ArrayBuffer;
  export default data;
}
