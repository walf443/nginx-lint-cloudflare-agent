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
  .spinner { display: none; }
  .loading .spinner { display: inline; }
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

  <div class="row">
    <button id="submit">Generate plugin</button>
    <span class="spinner">⏳ working… (this can take a minute)</span>
  </div>

  <div id="output"></div>

<script>
const $ = (s) => document.querySelector(s);
const ruleEl = $("#rule");
const out = $("#output");

document.querySelectorAll(".examples button").forEach((b) => {
  b.addEventListener("click", () => { ruleEl.value = b.dataset.ex; ruleEl.focus(); });
});

const esc = (s) => String(s).replace(/[&<>]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

function block(title, body) {
  if (body == null || body === "") return "";
  return \`<details><summary>\${esc(title)}</summary><pre>\${esc(body)}</pre></details>\`;
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
      body: JSON.stringify({ rule }),
    });
    const data = await res.json();

    const ok = data.ok;
    const status = data.error
      ? \`<span class="fail">⚠ \${esc(data.error)}</span>\`
      : ok
        ? \`<span class="ok">✓ Plugin passed</span> · \${data.attempts} attempt(s)\`
        : \`<span class="fail">✗ Did not pass</span> · \${data.attempts ?? 0} attempt(s)\`;

    const r = data.result || {};
    out.innerHTML =
      \`<div class="status">\${status}</div>\` +
      block("Summary", data.summary) +
      (data.plugin ? block("src/plugin.ts", data.plugin.pluginTs) : "") +
      (data.plugin ? block("src/plugin.test.ts", data.plugin.testTs) : "") +
      block("stdout", r.stdout) +
      block("stderr", r.stderr) +
      block("debug", data.debug ? JSON.stringify(data.debug, null, 2) : "") +
      (data.stack ? block("stack", data.stack) : "");
  } catch (e) {
    out.innerHTML = \`<div class="status fail">Request failed: \${esc(e.message)}</div>\`;
  } finally {
    document.body.classList.remove("loading");
    $("#submit").disabled = false;
  }
}

$("#submit").addEventListener("click", run);
ruleEl.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") run();
});
</script>
</body>
</html>`;
