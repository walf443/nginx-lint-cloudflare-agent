// Minimal binding types. Regenerate the full version any time with:
//   npm run cf-typegen   (wrangler types)
import type { Sandbox } from "@cloudflare/sandbox";

declare global {
  /**
   * Worker Loader binding (open beta). Shape kept minimal until the loader
   * backend PoC lands; see src/backends/loader.ts.
   */
  interface WorkerLoader {
    get(
      id: string,
      init: () => unknown | Promise<unknown>,
    ): { getEntrypoint(name?: string): Fetcher };
  }

  interface Env {
    /** Workers AI binding (wrangler -> ai.binding). */
    AI: Ai;
    /** Which verification backend to use: "sandbox" (default) | "loader". */
    VERIFY_BACKEND?: "sandbox" | "loader" | "" | undefined;
    /** Sandbox container Durable Object namespace (sandbox backend only). */
    Sandbox: DurableObjectNamespace<Sandbox>;
    /** Worker Loader binding (loader backend only; see wrangler.loader.jsonc). */
    LOADER?: WorkerLoader;
  }
}

export {};
