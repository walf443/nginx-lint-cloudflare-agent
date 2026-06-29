/**
 * Sandbox verification backend (the original, default backend).
 *
 * Materializes the generated plugin in a Cloudflare Sandbox container and runs
 * `npm install && tsc && (npm test | runner)` against the real nginx parser
 * shipped in the published `nginx-lint-plugin` SDK. Requires the Workers Paid
 * plan (Containers). For a plan-free alternative see ./loader.ts.
 */

import { getSandbox } from "@cloudflare/sandbox";
import { packageJson, TSCONFIG } from "../scaffold.js";
import type {
  CheckConfigsInput,
  CheckConfigsOutput,
  ConfigCheckResult,
  VerifyBackend,
  VerifyInput,
  VerifyResult,
} from "./types.js";

const WORKDIR = "/workspace/plugin";

// Compiled to dist/runner.js. Reads a configs JSON file (argv[2]) and emits the
// per-config results between sentinels so we can pull them out of tsc/npm noise.
const RUNNER_TS = `import { spec, check } from "./plugin.js";
import { PluginTestRunner } from "nginx-lint-plugin/testing";
import { readFileSync } from "node:fs";

const runner = new PluginTestRunner(spec, check);
const configs = JSON.parse(readFileSync(process.argv[2], "utf8")) as
  { name: string; content: string }[];

const results = configs.map((c) => {
  try {
    const errors = runner.checkString(c.content).map((e) => ({
      rule: e.rule,
      message: e.message,
      severity: e.severity,
      line: e.line,
      column: e.column,
      fixCount: (e.fixes || []).length,
    }));
    return { name: c.name, ok: true, errorCount: errors.length, errors };
  } catch (e) {
    return {
      name: c.name,
      ok: false,
      errorCount: 0,
      errors: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
});

process.stdout.write("__RESULT__" + JSON.stringify(results) + "__END__");
`;

async function compileAndTest(
  env: Env,
  input: VerifyInput,
): Promise<VerifyResult> {
  // One sandbox per logical session; reuse keeps the npm cache warm across
  // iterations of the fix loop.
  const sandbox = getSandbox(env.Sandbox, `author-${input.pluginName}`);

  await sandbox.writeFile(`${WORKDIR}/package.json`, input.packageJson);
  await sandbox.writeFile(`${WORKDIR}/tsconfig.json`, input.tsconfig);
  await sandbox.writeFile(`${WORKDIR}/src/plugin.ts`, input.pluginTs);
  await sandbox.writeFile(`${WORKDIR}/src/plugin.test.ts`, input.testTs);

  const result = await sandbox.exec(
    `sh -c "cd ${WORKDIR} && npm install --no-audit --no-fund --loglevel=error && npm test"`,
  );

  return {
    success: result.exitCode === 0,
    exitCode: result.exitCode,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

async function runConfigs(
  env: Env,
  input: CheckConfigsInput,
): Promise<CheckConfigsOutput> {
  // Same sandbox key as the authoring run so node_modules / npm cache are warm.
  const sandbox = getSandbox(env.Sandbox, `author-${input.pluginName}`);

  await sandbox.writeFile(`${WORKDIR}/package.json`, packageJson(input.pluginName));
  await sandbox.writeFile(`${WORKDIR}/tsconfig.json`, TSCONFIG);
  await sandbox.writeFile(`${WORKDIR}/src/plugin.ts`, input.pluginTs);
  await sandbox.writeFile(`${WORKDIR}/src/runner.ts`, RUNNER_TS);
  await sandbox.writeFile(
    `${WORKDIR}/configs.json`,
    JSON.stringify(input.configs),
  );

  const exec = await sandbox.exec(
    `sh -c "cd ${WORKDIR} && npm install --no-audit --no-fund --loglevel=error && npx tsc && node dist/runner.js configs.json"`,
  );

  const out = (exec.stdout ?? "") + (exec.stderr ?? "");
  const start = out.indexOf("__RESULT__");
  const end = out.indexOf("__END__");
  if (start === -1 || end === -1 || end < start) {
    return {
      results: [],
      raw: out.slice(-2000),
      error: `could not run checker (exit ${exec.exitCode})`,
    };
  }

  try {
    const results = JSON.parse(
      out.slice(start + "__RESULT__".length, end),
    ) as ConfigCheckResult[];
    return { results };
  } catch (e) {
    return {
      results: [],
      raw: out.slice(-2000),
      error: `bad checker output: ${(e as Error).message}`,
    };
  }
}

export const sandboxBackend: VerifyBackend = {
  name: "sandbox",
  compileAndTest,
  runConfigs,
};
