/**
 * Run an already-authored plugin against arbitrary nginx config strings.
 *
 * The plugin's `check()` is exercised through the SDK's PluginTestRunner
 * (`checkString`), which parses each config with the real nginx parser and
 * returns only this rule's LintErrors. We materialize a tiny runner script in
 * the sandbox, compile it alongside the plugin, and read back JSON.
 *
 * Two uses:
 *   - auto-verification: run the generated plugin over SAMPLE_CONFIGS so the
 *     response shows how it behaves on a spread of real configs.
 *   - UI playground: run it over a config the user pastes in.
 */

import { getSandbox } from "@cloudflare/sandbox";
import { packageJson, TSCONFIG } from "./scaffold.js";

const WORKDIR = "/workspace/plugin";

export interface ConfigSample {
  name: string;
  content: string;
}

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

export async function checkConfigs(
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

/**
 * A spread of representative nginx configs used for auto-verification. There is
 * no ground truth per rule (the rule is arbitrary), so this is a behavior/
 * robustness smoke test: it surfaces crashes and over-flagging, and lets a
 * human eyeball whether the plugin fires where expected.
 */
export const SAMPLE_CONFIGS: ConfigSample[] = [
  {
    name: "minimal",
    content: `events {}
http {
    server {
        listen 80;
        server_name example.com;
        location / {
            root /var/www/html;
        }
    }
}
`,
  },
  {
    name: "typical-web-server",
    content: `user www-data;
worker_processes auto;
events { worker_connections 1024; }
http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    sendfile on;
    keepalive_timeout 65;
    gzip on;
    gzip_types text/plain application/json;
    server {
        listen 80;
        server_name www.example.com;
        return 301 https://$host$request_uri;
    }
    server {
        listen 443 ssl;
        server_name www.example.com;
        ssl_certificate /etc/ssl/cert.pem;
        ssl_certificate_key /etc/ssl/key.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        location / {
            root /usr/share/nginx/html;
            index index.html;
        }
    }
}
`,
  },
  {
    name: "reverse-proxy",
    content: `events {}
http {
    upstream backend {
        server 127.0.0.1:8080;
        server 127.0.0.1:8081;
    }
    server {
        listen 80;
        location /api/ {
            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }
    }
}
`,
  },
  {
    name: "insecure-ish",
    content: `events {}
http {
    server_tokens on;
    server {
        listen 443 ssl;
        server_name legacy.example.com;
        ssl_protocols TLSv1 TLSv1.1 TLSv1.2;
        ssl_certificate /etc/ssl/cert.pem;
        ssl_certificate_key /etc/ssl/key.pem;
        autoindex on;
        location / {
            root /var/www;
        }
    }
}
`,
  },
  {
    name: "empty",
    content: `events {}
http {}
`,
  },
];
