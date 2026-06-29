/**
 * Backend-agnostic contract for verifying a generated plugin.
 *
 * A verification backend knows how to (a) compile a plugin + its test and run
 * the tests, and (b) run an authored plugin's check() over arbitrary configs.
 * The sandbox backend does this in a Cloudflare container; the loader backend
 * does it in an isolated Worker via the Worker Loader API. Callers select one
 * with getBackend(env) and never touch the concrete implementation.
 */

export interface ConfigSample {
  name: string;
  content: string;
}

// ---- compile + test (the model's build_and_test tool) --------------------

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

// ---- run plugin over configs (auto-verification + UI playground) ---------

/** A trimmed LintError, safe to hand to the UI. */
export interface LintErrorLite {
  rule: string;
  message: string;
  severity: string;
  line: number;
  column: number;
  fixCount: number;
}

export interface ConfigCheckResult {
  name: string;
  /** true if check() ran without throwing (regardless of error count). */
  ok: boolean;
  errorCount: number;
  errors: LintErrorLite[];
  /** exception message if the plugin threw on this config. */
  error?: string;
}

export interface CheckConfigsInput {
  pluginName: string;
  pluginTs: string;
  configs: ConfigSample[];
}

export interface CheckConfigsOutput {
  results: ConfigCheckResult[];
  /** raw output, surfaced when we could not parse a result (e.g. compile error). */
  raw?: string;
  error?: string;
}

export interface VerifyBackend {
  /** Human-readable id, surfaced in responses for debugging which backend ran. */
  readonly name: string;
  compileAndTest(env: Env, input: VerifyInput): Promise<VerifyResult>;
  runConfigs(env: Env, input: CheckConfigsInput): Promise<CheckConfigsOutput>;
}
