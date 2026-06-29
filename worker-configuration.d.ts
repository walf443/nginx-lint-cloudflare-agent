// Minimal binding types. Regenerate the full version any time with:
//   npm run cf-typegen   (wrangler types)
import type { Sandbox } from "@cloudflare/sandbox";

declare global {
  interface Env {
    /** Workers AI binding (wrangler.jsonc -> ai.binding). */
    AI: Ai;
    /** Sandbox container Durable Object namespace. */
    Sandbox: DurableObjectNamespace<Sandbox>;
  }
}

export {};
