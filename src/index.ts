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
import { SYSTEM_PROMPT } from "./prompt.js";
import { packageJson, TSCONFIG } from "./scaffold.js";
import { verifyPlugin, type VerifyResult } from "./verify.js";

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
): Promise<{ summary: string; attempts: number; last: SubmittedPlugin | null }> {
  const workersai = createWorkersAI({ binding: env.AI });

  let attempts = 0;
  let last: SubmittedPlugin | null = null;

  const result = await generateText({
    model: workersai(MODEL),
    system: SYSTEM_PROMPT,
    prompt:
      `Write an nginx-lint plugin for this rule and verify it passes:\n\n${rule}`,
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
          const res = await verifyPlugin(env, {
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

  return { summary: result.text, attempts, last };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return new Response(
        "POST { \"rule\": \"<describe the lint rule>\" }\n",
        { status: 405 },
      );
    }

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

    const { summary, attempts, last } = await authorPlugin(rule, env);

    return Response.json({
      ok: last?.result.success ?? false,
      attempts,
      summary,
      plugin: last
        ? { name: last.pluginName, pluginTs: last.pluginTs, testTs: last.testTs }
        : null,
      result: last?.result ?? null,
    });
  },
} satisfies ExportedHandler<Env>;
