/**
 * nginx-lint-cloudflare-agent
 *
 * A Cloudflare Worker that, given a natural-language rule description, asks a
 * Workers AI model (GPT-OSS) to author an nginx-lint TypeScript plugin, then
 * verifies it inside a Cloudflare Sandbox by compiling and running its tests
 * against the real nginx parser (shipped in the published nginx-lint-plugin SDK).
 *
 * POST /  { "rule": "warn when gzip is not enabled in http" }
 *   -> { ok, attempts, plugin: { pluginTs, testTs }, result: { stdout, ... } }
 */

import { generateText, stepCountIs, tool } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { z } from "zod";
import { getBackend } from "./backends/index.js";
import type { ConfigSample, VerifyResult } from "./backends/types.js";
import { SYSTEM_PROMPT } from "./prompt.js";
import { SAMPLE_CONFIGS } from "./sample-configs.js";
import { packageJson, pluginProjectPackageJson, TSCONFIG } from "./scaffold.js";
import { UI_HTML } from "./ui.js";

// The Sandbox Durable Object class must be re-exported from the entrypoint.
export { Sandbox } from "@cloudflare/sandbox";

const MODEL = "@cf/openai/gpt-oss-120b" as const;
const MAX_STEPS = 8;

// Truncate tool output so we don't blow the model's context with npm noise.
function tail(s: string, max = 4000): string {
  return s.length <= max ? s : s.slice(s.length - max);
}

interface SubmittedPlugin {
  pluginName: string;
  pluginTs: string;
  testTs: string;
  result: VerifyResult;
}

async function authorPlugin(
  rule: string,
  env: Env,
): Promise<{
  summary: string;
  attempts: number;
  last: SubmittedPlugin | null;
  debug: unknown;
}> {
  const workersai = createWorkersAI({ binding: env.AI });
  const backend = getBackend(env);

  let attempts = 0;
  let last: SubmittedPlugin | null = null;

  const result = await generateText({
    model: workersai(MODEL),
    system: SYSTEM_PROMPT,
    prompt:
      `Write an nginx-lint plugin for this rule and verify it passes:\n\n${rule}`,
    // GPT-OSS is a reasoning model and spends many tokens thinking before it
    // emits text/tool calls. Without a generous cap the response is truncated
    // (finishReason "length") with zero visible output.
    maxOutputTokens: 16000,
    stopWhen: stepCountIs(MAX_STEPS),
    tools: {
      build_and_test: tool({
        description:
          "Compile the plugin + its test with tsc and run them against the real " +
          "nginx parser. Returns the npm/test output. Call repeatedly until tests pass.",
        inputSchema: z.object({
          pluginName: z
            .string()
            .describe("kebab-case rule name, e.g. gzip-not-enabled"),
          pluginTs: z.string().describe("full contents of src/plugin.ts"),
          testTs: z.string().describe("full contents of src/plugin.test.ts"),
        }),
        execute: async ({ pluginName, pluginTs, testTs }) => {
          attempts++;
          const res = await backend.compileAndTest(env, {
            pluginName,
            pluginTs,
            testTs,
            packageJson: packageJson(pluginName),
            tsconfig: TSCONFIG,
          });
          last = { pluginName, pluginTs, testTs, result: res };

          if (res.success) {
            return `PASS — tests succeeded.\n${tail(res.stdout, 1500)}`;
          }
          return [
            `FAIL — exit ${res.exitCode}. Fix the code and call build_and_test again.`,
            `--- stdout ---\n${tail(res.stdout)}`,
            `--- stderr ---\n${tail(res.stderr)}`,
          ].join("\n");
        },
      }),
    },
  });

  // Diagnostics: surface why the model may have produced nothing.
  const debug = {
    finishReason: result.finishReason,
    steps: result.steps.length,
    warnings: result.warnings ?? [],
    textLength: result.text.length,
  };
  console.log("authorPlugin result:", JSON.stringify(debug, null, 2));

  return { summary: result.text, attempts, last, debug };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "GET") {
      return new Response(UI_HTML, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    if (request.method !== "POST") {
      return new Response(
        "POST { \"rule\": \"<describe the lint rule>\" }\n",
        { status: 405 },
      );
    }

    const path = new URL(request.url).pathname;
    if (path === "/check") return handleCheck(request, env);
    return handleGenerate(request, env);
  },
} satisfies ExportedHandler<Env>;

// POST / — author a plugin from a rule description, then run it over a spread
// of sample configs so the response shows how it behaves on real configs.
async function handleGenerate(request: Request, env: Env): Promise<Response> {
  let rule: string;
  try {
    const body = (await request.json()) as { rule?: string };
    if (!body.rule) throw new Error("missing 'rule'");
    rule = body.rule;
  } catch (e) {
    return Response.json(
      { ok: false, error: `bad request: ${(e as Error).message}` },
      { status: 400 },
    );
  }

  try {
    const { summary, attempts, last, debug } = await authorPlugin(rule, env);

    // Behavior smoke test against the built-in corpus (best-effort).
    let patternChecks = null;
    if (last) {
      try {
        const checked = await getBackend(env).runConfigs(env, {
          pluginName: last.pluginName,
          pluginTs: last.pluginTs,
          configs: SAMPLE_CONFIGS,
        });
        patternChecks = checked.error
          ? { error: checked.error, raw: checked.raw }
          : checked.results;
      } catch (e) {
        patternChecks = { error: `pattern check failed: ${(e as Error).message}` };
      }
    }

    return Response.json({
      ok: last?.result.success ?? false,
      attempts,
      summary,
      debug,
      plugin: last
        ? {
            name: last.pluginName,
            pluginTs: last.pluginTs,
            testTs: last.testTs,
            // A complete, build-ready project so the plugin can be built to a
            // .wasm component and verified locally: `npm install`, then
            // `npm run build` (jco componentize) and/or `npm test`.
            packageJson: pluginProjectPackageJson(last.pluginName),
            tsconfig: TSCONFIG,
          }
        : null,
      result: last?.result ?? null,
      patternChecks,
    });
  } catch (e) {
    console.error("authorPlugin threw:", e);
    return Response.json(
      { ok: false, error: `agent error: ${(e as Error).message}`, stack: (e as Error).stack },
      { status: 500 },
    );
  }
}

// POST /check — run an already-generated plugin against caller-supplied configs.
// Body: { pluginName, pluginTs, config? : string, configs? : ConfigSample[] }
async function handleCheck(request: Request, env: Env): Promise<Response> {
  let pluginName: string;
  let pluginTs: string;
  let configs: ConfigSample[];
  try {
    const body = (await request.json()) as {
      pluginName?: string;
      pluginTs?: string;
      config?: string;
      configs?: ConfigSample[];
    };
    if (!body.pluginName || !body.pluginTs) {
      throw new Error("missing 'pluginName' or 'pluginTs'");
    }
    configs = body.configs
      ?? (body.config != null
        ? [{ name: "your config", content: body.config }]
        : []);
    if (configs.length === 0) throw new Error("missing 'config' or 'configs'");
    pluginName = body.pluginName;
    pluginTs = body.pluginTs;
  } catch (e) {
    return Response.json(
      { ok: false, error: `bad request: ${(e as Error).message}` },
      { status: 400 },
    );
  }

  try {
    const checked = await getBackend(env).runConfigs(env, {
      pluginName,
      pluginTs,
      configs,
    });
    return Response.json(
      checked.error
        ? { ok: false, error: checked.error, raw: checked.raw }
        : { ok: true, results: checked.results },
      { status: checked.error ? 500 : 200 },
    );
  } catch (e) {
    console.error("checkConfigs threw:", e);
    return Response.json(
      { ok: false, error: `check error: ${(e as Error).message}` },
      { status: 500 },
    );
  }
}
