/**
 * Minimal single-page UI for the agent. Served on GET / so you can submit a
 * rule and inspect the result without reaching for curl.
 */
export const UI_HTML = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>nginx-lint plugin agent</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
    margin: 0; padding: 2rem; max-width: 880px; margin-inline: auto;
  }
  h1 { font-size: 1.4rem; margin: 0 0 .25rem; }
  p.sub { margin: 0 0 1.5rem; opacity: .7; }
  label { display: block; font-weight: 600; margin-bottom: .4rem; }
  textarea {
    width: 100%; min-height: 90px; padding: .7rem; border-radius: 8px;
    border: 1px solid #8884; font: inherit; resize: vertical;
    background: #80808012;
  }
  .row { display: flex; gap: .75rem; align-items: center; margin-top: .75rem; }
  button {
    font: inherit; font-weight: 600; padding: .6rem 1.2rem; border: 0;
    border-radius: 8px; background: #2563eb; color: #fff; cursor: pointer;
  }
  button:disabled { opacity: .5; cursor: progress; }
  .examples { margin-top: .5rem; font-size: .85rem; opacity: .8; }
  .examples button {
    background: #8882; color: inherit; padding: .25rem .6rem; font-weight: 400;
    margin: .2rem .3rem 0 0; border-radius: 6px;
  }
  .status { margin: 1.25rem 0 .5rem; font-weight: 600; }
  .ok { color: #16a34a; } .fail { color: #dc2626; }
  details { margin-top: 1rem; }
  summary { cursor: pointer; font-weight: 600; }
  pre {
    background: #80808018; padding: .8rem; border-radius: 8px; overflow: auto;
    font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
    white-space: pre-wrap; word-break: break-word;
  }
  .spinner, .spinner2 { display: none; }
  .loading .spinner { display: inline; }
  .checking .spinner2 { display: inline; }
  .checks { margin-top: 1rem; }
  .checks h3 { font-size: 1rem; margin: 0 0 .5rem; }
  .check {
    border: 1px solid #8883; border-radius: 8px; padding: .55rem .75rem;
    margin-bottom: .5rem;
  }
  .check .head { display: flex; gap: .5rem; align-items: baseline; }
  .check .name { font-weight: 600; }
  .check .count { font-size: .8rem; padding: .05rem .5rem; border-radius: 999px; background: #8882; }
  .check .count.hit { background: #f59e0b33; }
  .check .count.crash { background: #dc262633; }
  .check ul { margin: .4rem 0 0; padding-left: 1.2rem; font-size: .85rem; }
  .check li { font-family: ui-monospace, Menlo, monospace; }
  .check .sev-error { color: #dc2626; }
  .check .sev-warning { color: #d97706; }
  .playground { margin-top: 2rem; border-top: 1px solid #8883; padding-top: 1.25rem; display: none; }
  .playground.show { display: block; }
  .backend-pick { font-size: .9rem; opacity: .85; gap: 1rem; }
  .backend-pick label { font-weight: 400; display: inline-flex; align-items: center; gap: .3rem; }
  .timing { font-size: .8rem; opacity: .7; }
</style>
</head>
<body>
  <h1>nginx-lint plugin agent</h1>
  <p class="sub">Describe a lint rule in plain English. The agent writes an
    nginx-lint TypeScript plugin and verifies it in a sandbox.</p>

  <label for="rule">Rule description</label>
  <textarea id="rule" placeholder="warn when gzip is not enabled in http"></textarea>

  <div class="examples">
    Examples:
    <button data-ex="warn when gzip is not enabled in http">gzip not enabled</button>
    <button data-ex="error when server_tokens is on">server_tokens on</button>
    <button data-ex="warn when ssl_protocols includes TLSv1 or TLSv1.1">weak TLS</button>
  </div>

  <div class="row backend-pick">
    <span>Verify with:</span>
    <label><input type="radio" name="backend" value="sandbox" checked /> sandbox (container)</label>
    <label><input type="radio" name="backend" value="loader" /> loader (isolate)</label>
  </div>

  <div class="row">
    <button id="submit">Generate plugin</button>
    <span class="spinner">⏳ working… (this can take a minute)</span>
  </div>

  <div id="output"></div>

  <section class="playground" id="playground">
    <h2 style="font-size:1.15rem;">Try it on your own config</h2>
    <p class="sub">Paste an nginx config and run the generated plugin against it.</p>
    <label for="userconf">nginx config</label>
    <textarea id="userconf" placeholder="events {}
http {
    server { server_tokens on; }
}"></textarea>
    <div class="row">
      <button id="runcheck">Run check</button>
      <span class="spinner2">⏳ running…</span>
    </div>
    <div id="checkout"></div>
  </section>

<script>
const $ = (s) => document.querySelector(s);
const ruleEl = $("#rule");
const out = $("#output");

// Currently selected verification backend (sandbox | loader).
const backend = () =>
  (document.querySelector("input[name=backend]:checked") || {}).value || "sandbox";
const fmtTiming = (t) => {
  if (!t) return "";
  const parts = [];
  if (t.backend) parts.push(esc(t.backend));
  if (t.ms != null) parts.push(t.ms + "ms");
  if (t.verifyMs != null) parts.push("verify " + t.verifyMs + "ms");
  if (t.patternMs) parts.push("sample " + t.patternMs + "ms");
  return parts.length ? \` · <span class="timing">\${parts.join(" · ")}</span>\` : "";
};

document.querySelectorAll(".examples button").forEach((b) => {
  b.addEventListener("click", () => { ruleEl.value = b.dataset.ex; ruleEl.focus(); });
});

const esc = (s) => String(s).replace(/[&<>]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

function block(title, body) {
  if (body == null || body === "") return "";
  return \`<details><summary>\${esc(title)}</summary><pre>\${esc(body)}</pre></details>\`;
}

let lastPlugin = null; // { name, pluginTs } of the most recent generation

// Render an array of per-config check results (from /check or patternChecks).
function renderChecks(results, title) {
  if (!Array.isArray(results)) {
    return block(title || "Config checks", results && results.error
      ? results.error + (results.raw ? "\\n\\n" + results.raw : "")
      : JSON.stringify(results, null, 2));
  }
  const items = results.map((r) => {
    const cls = !r.ok ? "crash" : r.errorCount > 0 ? "hit" : "";
    const badge = !r.ok ? "crashed" : r.errorCount + " issue" + (r.errorCount === 1 ? "" : "s");
    const errs = !r.ok
      ? \`<ul><li class="sev-error">\${esc(r.error || "threw")}</li></ul>\`
      : r.errors && r.errors.length
        ? "<ul>" + r.errors.map((e) =>
            \`<li class="sev-\${esc(e.severity)}">L\${e.line}:\${e.column} [\${esc(e.severity)}] \${esc(e.message)}\${e.fixCount ? " (fix)" : ""}</li>\`
          ).join("") + "</ul>"
        : "";
    return \`<div class="check"><div class="head"><span class="name">\${esc(r.name)}</span>\` +
      \`<span class="count \${cls}">\${esc(badge)}</span></div>\${errs}</div>\`;
  }).join("");
  return \`<div class="checks"><h3>\${esc(title || "Config checks")}</h3>\${items}</div>\`;
}

async function run() {
  const rule = ruleEl.value.trim();
  if (!rule) { ruleEl.focus(); return; }

  document.body.classList.add("loading");
  $("#submit").disabled = true;
  out.innerHTML = "";

  try {
    const res = await fetch("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rule, backend: backend() }),
    });
    const data = await res.json();

    const ok = data.ok;
    const status = (data.error
      ? \`<span class="fail">⚠ \${esc(data.error)}</span>\`
      : ok
        ? \`<span class="ok">✓ Plugin passed</span> · \${data.attempts} attempt(s)\`
        : \`<span class="fail">✗ Did not pass</span> · \${data.attempts ?? 0} attempt(s)\`)
      + fmtTiming(data.timing);

    const r = data.result || {};
    out.innerHTML =
      \`<div class="status">\${status}</div>\` +
      (data.patternChecks ? renderChecks(data.patternChecks, "Behavior on sample configs") : "") +
      block("Summary", data.summary) +
      (data.plugin ? block("src/plugin.ts", data.plugin.pluginTs) : "") +
      (data.plugin ? block("src/plugin.test.ts", data.plugin.testTs) : "") +
      (data.plugin ? block("package.json", data.plugin.packageJson) : "") +
      (data.plugin ? block("tsconfig.json", data.plugin.tsconfig) : "") +
      block("stdout", r.stdout) +
      block("stderr", r.stderr) +
      block("debug", data.debug ? JSON.stringify(data.debug, null, 2) : "") +
      (data.stack ? block("stack", data.stack) : "");

    // Enable the playground once we have a usable plugin.
    if (data.plugin) {
      lastPlugin = { name: data.plugin.name, pluginTs: data.plugin.pluginTs };
      $("#playground").classList.add("show");
    }
  } catch (e) {
    out.innerHTML = \`<div class="status fail">Request failed: \${esc(e.message)}</div>\`;
  } finally {
    document.body.classList.remove("loading");
    $("#submit").disabled = false;
  }
}

async function runCheck() {
  if (!lastPlugin) return;
  const config = $("#userconf").value;
  if (!config.trim()) { $("#userconf").focus(); return; }

  const checkout = $("#checkout");
  document.body.classList.add("checking");
  $("#runcheck").disabled = true;
  checkout.innerHTML = "";

  try {
    const res = await fetch("/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pluginName: lastPlugin.name,
        pluginTs: lastPlugin.pluginTs,
        config,
        backend: backend(),
      }),
    });
    const data = await res.json();
    const t = \`<div class="status">Result\${fmtTiming(data.timing)}</div>\`;
    checkout.innerHTML = data.ok
      ? t + renderChecks(data.results, "Result")
      : t + \`<div class="status fail">\${esc(data.error || "check failed")}</div>\` +
        block("output", data.raw);
  } catch (e) {
    checkout.innerHTML = \`<div class="status fail">Request failed: \${esc(e.message)}</div>\`;
  } finally {
    document.body.classList.remove("checking");
    $("#runcheck").disabled = false;
  }
}

$("#submit").addEventListener("click", run);
ruleEl.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") run();
});
$("#runcheck").addEventListener("click", runCheck);
$("#userconf").addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") runCheck();
});
</script>
</body>
</html>`;
