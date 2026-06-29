/**
 * Verification step: materialize a generated plugin in a sandbox, then run
 * `npm install && npm test`. The test step uses the published
 * `nginx-lint-plugin` SDK (which bundles the real nginx parser as wasm), so a
 * pass means the plugin behaves correctly against actual parsed configs.
 */

import { getSandbox } from "@cloudflare/sandbox";

export interface VerifyInput {
  pluginName: string;
  pluginTs: string;
  testTs: string;
  packageJson: string;
  tsconfig: string;
}

export interface VerifyResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
}

const WORKDIR = "/workspace/plugin";

export async function verifyPlugin(
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
