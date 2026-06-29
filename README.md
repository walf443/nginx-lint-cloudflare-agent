# nginx-lint-cloudflare-agent

An experiment: a Cloudflare Worker agent that **writes and verifies
[nginx-lint](https://github.com/walf443/nginx-lint) TypeScript plugins**.

Given a plain-language rule description, it asks a Workers AI model (GPT-OSS) to
author a plugin, then verifies the result inside a Cloudflare **Sandbox** by
compiling it and running its tests against the *real* nginx parser — which ships
as wasm inside the published [`nginx-lint-plugin`](https://www.npmjs.com/package/nginx-lint-plugin)
SDK. No `jco componentize` needed for the verify loop.

```
POST /  { "rule": "warn when gzip is not enabled in the http context" }
  -> generate plugin.ts + plugin.test.ts  (Workers AI / GPT-OSS)
  -> npm install nginx-lint-plugin && npm test   (Cloudflare Sandbox)
  -> on failure, feed output back to the model and retry (up to 8 steps)
  -> { ok, attempts, plugin: { pluginTs, testTs }, result }
```

## Architecture

| Concern | Where |
| --- | --- |
| Model (code generation) | Workers AI `@cf/openai/gpt-oss-120b` via `env.AI` |
| Tool / agent loop | Vercel AI SDK (`generateText` + `tool` + `stepCountIs`) |
| Build & test execution | Cloudflare Sandbox SDK (`getSandbox`, `writeFile`, `exec`) |
| nginx parsing in tests | `nginx-lint-plugin` SDK (bundled wasm parser) |

The Worker isolate never runs `tsc`/`jco`; that all happens in the Sandbox
container, which has Node + npm.

## Setup

```bash
npm install

# Pin the Dockerfile base image to the installed sandbox version:
node -p "require('@cloudflare/sandbox/package.json').version"
# -> edit Dockerfile: FROM docker.io/cloudflare/sandbox:<that version>

npm run cf-typegen   # regenerate worker-configuration.d.ts
npm run dev          # local dev (containers require Docker running locally)
```

## Try it

```bash
curl -s localhost:8787 -X POST \
  -H 'content-type: application/json' \
  -d '{"rule":"warn when gzip is not enabled in the http context"}' | jq
```

## Status / TODO

- [ ] Confirm `@cloudflare/sandbox` version & matching Dockerfile tag
- [ ] Tune the system prompt with more few-shot examples from real plugins
- [ ] Persist accepted plugins / open a PR against nginx-lint
- [ ] Consider Agents SDK (Durable Object state) for multi-turn refinement
- [ ] Decide whether outputs are worth publishing
```
