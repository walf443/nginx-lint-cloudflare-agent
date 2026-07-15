/**
 * Isolate SDK library for the loader backend's generated plugin.
 *
 * Bundled by `npm run build:harness` into loader-sdk.bundle.txt and injected as
 * the "sdk.js" module. The generated plugin's transpiled plugin.ts has its
 * bare `nginx-lint-plugin` import rewritten to "./sdk.js" so it resolves here:
 * the isolate has no node_modules. Type-only imports vanish under sucrase, but
 * `buildConfigFromSnapshot` is a real value import, so it needs a real module.
 *
 * Nothing here touches the parser wasm — buildConfigFromSnapshot just
 * reconstructs a Config from a snapshot the host already produced.
 */
export { API_VERSION, buildConfigFromSnapshot } from "nginx-lint-plugin";
