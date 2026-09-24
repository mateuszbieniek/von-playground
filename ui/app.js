import {
  newQuestion, emptyDraft, isDraftEmpty, buildRequest, validate, parseRequest,
  formatDetail, toCurl, PRESETS, cloneDraft,
} from "./model.js";

const $ = (sel, root = document) => root.querySelector(sel);
const API_STORAGE = "von-playground.api";
const DEFAULT_API = "http://localhost:8000";

let draft = emptyDraft();
let mode = "form";
let apiKey = "";
let pendingPreset = null;

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function apiBase() {
  return ($("#api-url").value.trim() || DEFAULT_API).replace(/\/+$/, "");
}

function initToolbar() {
  const params = new URLSearchParams(location.search);
  let saved = "";
  try { saved = localStorage.getItem(API_STORAGE) || ""; } catch { /* storage blocked */ }
  $("#api-url").value = params.get("api") || saved || DEFAULT_API;
  try { localStorage.setItem(API_STORAGE, apiBase()); } catch { /* storage blocked */ }
  $("#api-url").addEventListener("change", () => {
    try { localStorage.setItem(API_STORAGE, apiBase()); } catch { /* storage blocked */ }
  });
  $("#api-key").addEventListener("input", (e) => { apiKey = e.target.value; });

  const sel = $("#preset");
  PRESETS.forEach((p, i) => {
    const o = document.createElement("option");
    o.value = String(i);
    o.textContent = p.name;
    sel.appendChild(o);
  });
  sel.addEventListener("change", () => {
    const i = sel.value;
    sel.value = "";
    if (i === "") return;
    requestLoad(PRESETS[i].draft);
  });
  $("#reset").addEventListener("click", () => requestLoad(emptyDraft()));
  $("#confirm-yes").addEventListener("click", () => { loadDraft(pendingPreset); hideConfirm(); });
  $("#confirm-no").addEventListener("click", hideConfirm);
}

function requestLoad(d) {
  if (isDraftEmpty(draft)) { loadDraft(d); return; }
  pendingPreset = d;
  $("#confirm").classList.remove("hidden");
}

function hideConfirm() {
  pendingPreset = null;
  $("#confirm").classList.add("hidden");
}

function loadDraft(d) {
  draft = cloneDraft(d);
  $("#state").value = draft.state;
  renderQuestions();
  refreshErrors();
  if (mode === "raw") $("#raw").value = JSON.stringify(buildRequest(draft), null, 2);
}

function initState() {
  $("#state").addEventListener("input", (e) => { draft.state = e.target.value; refreshErrors(); });
}

function refreshErrors() {
  const ul = $("#errors");
  const errs = mode === "form" ? validate(draft) : [];
  ul.innerHTML = errs.map((e) => `<li>${esc(e)}</li>`).join("");
  $("#run").disabled = errs.length > 0;
}

const TYPES = ["choice", "score", "noul"];

function questionBody(q) {
  if (q.type === "choice") {
    return `<div class="rows">${q.criteria.map((c, i) => `
      <div class="row" data-index="${i}">
        <input data-field="criteria.key" placeholder="key" value="${esc(c.key)}" spellcheck="false">
        <input data-field="criteria.description" placeholder="description (optional)" value="${esc(c.description)}">
        <button type="button" class="icon row-delete" title="Remove option">×</button>
      </div>`).join("")}
      <button type="button" class="add-row" data-add="criteria">+ option</button></div>`;
  }
  if (q.type === "score") {
    return `<div class="rows">${q.levels.map((l, i) => `
      <div class="row" data-index="${i}">
        <span class="level-no">${i}</span>
        <input data-field="levels" placeholder="level description" value="${esc(l)}">
        <button type="button" class="icon row-up" title="Move up">↑</button>
        <button type="button" class="icon row-down" title="Move down">↓</button>
        <button type="button" class="icon row-delete" title="Remove level">×</button>
      </div>`).join("")}
      <button type="button" class="add-row" data-add="levels">+ level</button></div>`;
  }
  return `
    <textarea data-field="trueText" placeholder="criteria for TRUE (optional)">${esc(q.trueText)}</textarea>
    <textarea data-field="falseText" placeholder="criteria for FALSE (optional)">${esc(q.falseText)}</textarea>`;
}

function renderQuestions() {
  $("#questions").innerHTML = draft.questions.map((q) => `
    <div class="card question" data-id="${q.id}">
      <div class="card-head">
        <input class="q-name" data-field="name" placeholder="name" value="${esc(q.name)}" spellcheck="false">
        <select class="q-type" data-field="type">
          ${TYPES.map((t) => `<option value="${t}"${t === q.type ? " selected" : ""}>${t}</option>`).join("")}
        </select>
        <button type="button" class="icon q-delete" title="Remove question">×</button>
      </div>
      <textarea data-field="instructions" placeholder="instructions">${esc(q.instructions)}</textarea>
      ${questionBody(q)}
    </div>`).join("");
}

function findQuestion(el) {
  const card = el.closest(".question");
  return card ? draft.questions.find((q) => q.id === card.dataset.id) : null;
}

function rowIndex(el) {
  const row = el.closest(".row");
  return row ? Number(row.dataset.index) : -1;
}

function initQuestions() {
  const root = $("#questions");

  root.addEventListener("input", (e) => {
    const q = findQuestion(e.target);
    const field = e.target.dataset.field;
    if (!q || !field) return;
    const v = e.target.value;
    if (field === "criteria.key") q.criteria[rowIndex(e.target)].key = v;
    else if (field === "criteria.description") q.criteria[rowIndex(e.target)].description = v;
    else if (field === "levels") q.levels[rowIndex(e.target)] = v;
    else if (field !== "type") q[field] = v;
    refreshErrors();
  });

  root.addEventListener("change", (e) => {
    if (e.target.dataset.field !== "type") return;
    const q = findQuestion(e.target);
    const fresh = newQuestion(e.target.value);
    const i = draft.questions.indexOf(q);
    draft.questions[i] = { ...fresh, id: q.id, name: q.name, instructions: q.instructions };
    renderQuestions();
    refreshErrors();
  });

  root.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const q = findQuestion(btn);
    if (!q) return;
    const i = rowIndex(btn);
    const list = q.type === "choice" ? q.criteria : q.levels;
    if (btn.classList.contains("q-delete")) {
      draft.questions = draft.questions.filter((x) => x !== q);
    } else if (btn.dataset.add === "criteria") {
      q.criteria.push({ key: "", description: "" });
    } else if (btn.dataset.add === "levels") {
      q.levels.push("");
    } else if (btn.classList.contains("row-delete")) {
      list.splice(i, 1);
    } else if (btn.classList.contains("row-up") && i > 0) {
      [list[i - 1], list[i]] = [list[i], list[i - 1]];
    } else if (btn.classList.contains("row-down") && i < list.length - 1) {
      [list[i], list[i + 1]] = [list[i + 1], list[i]];
    } else {
      return;
    }
    renderQuestions();
    refreshErrors();
  });

  $("#add-question").addEventListener("click", () => {
    draft.questions.push(newQuestion("choice"));
    renderQuestions();
    refreshErrors();
    const cards = root.querySelectorAll(".question");
    cards[cards.length - 1]?.querySelector(".q-name")?.focus();
  });
}

let health = "unknown";

function setHealth(state, tip) {
  health = state;
  const dot = $("#health");
  dot.className = `dot ${state}`;
  dot.title = tip || { unknown: "not checked yet", down: "Von unreachable", up: "Von up, model not verified yet", serving: "Von serving" }[state];
}

function headers() {
  const h = { "content-type": "application/json" };
  if (apiKey) h.Authorization = `Bearer ${apiKey}`;
  return h;
}

function showRunError(msg) {
  let el = $("#run-error");
  if (!el) {
    el = document.createElement("div");
    el.id = "run-error";
    $("#errors").after(el);
  }
  el.textContent = msg;
}

function clearRunError() {
  $("#run-error")?.remove();
}

function renderCurl(request) {
  let box = $("#curl-box");
  if (!box) {
    box = document.createElement("div");
    box.id = "curl-box";
    box.innerHTML = `<details>
      <summary>curl <button type="button" class="icon" id="copy-curl">copy</button></summary>
      <pre id="curl-text"></pre>
    </details>`;
    $("#errors").after(box);
    $("#copy-curl").addEventListener("click", (e) => { e.preventDefault(); copyText($("#curl-text").textContent, e.target); });
  }
  $("#curl-text").textContent = toCurl(apiBase(), request, apiKey);
}

let pendingTimer = null;

function setPending(on) {
  const btn = $("#run");
  clearInterval(pendingTimer);
  if (on) {
    const t0 = performance.now();
    btn.disabled = true;
    btn.textContent = "Running… 0 ms";
    pendingTimer = setInterval(() => { btn.textContent = `Running… ${Math.round(performance.now() - t0)} ms`; }, 100);
  } else {
    btn.textContent = "Run";
    refreshErrors();
  }
}

async function run() {
  clearRunError();
  let body;
  if (mode === "raw") {
    try { body = JSON.parse($("#raw").value); } catch (e) { showRunError(`Invalid JSON: ${e.message}`); return; }
  } else {
    if (validate(draft).length) return;
    body = buildRequest(draft);
  }
  renderCurl(body);
  $("#results").innerHTML = '<p class="muted">Running…</p>';
  setPending(true);
  const t0 = performance.now();
  try {
    const res = await fetch(`${apiBase()}/v1/systemone`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
    const ms = Math.round(performance.now() - t0);
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { /* non-JSON body */ }
    if (res.status === 401) { showRunError("API key required or wrong. Set it in the toolbar."); return; }
    if (res.status === 422) { showRunError(formatDetail(data?.detail)); return; }
    if (!res.ok) { showRunError(`Von unreachable at ${apiBase()}`); return; }
    setHealth("serving");
    renderResults(data, ms);
  } catch {
    showRunError(`Von unreachable at ${apiBase()}`);
  } finally {
    setPending(false);
  }
}

function pct(p) {
  return `${(p * 100).toFixed(1)}%`;
}

function bar(label, p, win) {
  return `<div class="bar${win ? " win" : ""}">
    <span class="label" title="${esc(label)}">${esc(label)}</span>
    <span class="track"><span class="fill" style="width:${(p * 100).toFixed(1)}%"></span></span>
    <span class="pct">${pct(p)}</span>
  </div>`;
}

function badge(conf) {
  const band = conf >= 0.8 ? "green" : conf >= 0.5 ? "amber" : "red";
  return `<span class="badge ${band}">conf ${conf.toFixed(2)}</span>`;
}

function answerCard(name, a) {
  let body = "";
  let head = "";
  if (a.type === "choice") {
    head = badge(a.confidence);
    const rows = Object.entries(a.probabilities).sort((x, y) => y[1] - x[1]);
    body = rows.map(([k, p]) => bar(k, p, k === a.choice)).join("");
  } else if (a.type === "score") {
    head = badge(a.confidence);
    const keys = Object.keys(a.probabilities).sort((x, y) => Number(x) - Number(y));
    const argmax = keys.reduce((best, k) => (a.probabilities[k] > a.probabilities[best] ? k : best), keys[0]);
    body = `<div class="headline">${a.score.toFixed(2)} <small>of 0 to ${keys.length - 1}</small></div>`
      + keys.map((k) => bar(`${k}: ${a.legend[k] ?? ""}`, a.probabilities[k], k === argmax)).join("");
  } else if (a.type === "noul") {
    const isTrue = a.noul >= 0.5;
    body = `<div class="headline">${isTrue ? "true" : "false"} <small>${pct(isTrue ? a.noul : 1 - a.noul)}</small></div>`
      + bar("true", a.noul, isTrue) + bar("false", 1 - a.noul, !isTrue);
  } else {
    body = `<pre>${esc(JSON.stringify(a, null, 2))}</pre>`;
  }
  return `<div class="card answer">
    <h3>${esc(name)} <span class="type">${esc(a.type ?? "?")}</span>${head}</h3>
    ${body}
  </div>`;
}

function renderResults(data, ms) {
  const answers = Object.entries(data.answers || {}).map(([n, a]) => answerCard(n, a)).join("");
  const u = data.usage || {};
  $("#results").innerHTML = `
    ${answers}
    <div class="footer">
      <span>model <b>${esc(data.model ?? "?")}</b></span>
      <span>in <b>${esc(u.input_tokens ?? "?")}</b> tok</span>
      <span>out <b>${esc(u.output_tokens ?? "?")}</b> tok</span>
      <span>time <b>${ms}</b> ms</span>
    </div>
    <details>
      <summary>Raw JSON <button type="button" class="icon" id="copy-json">copy</button></summary>
      <pre id="raw-json">${esc(JSON.stringify(data, null, 2))}</pre>
    </details>`;
  $("#copy-json").addEventListener("click", (e) => { e.preventDefault(); copyText($("#raw-json").textContent, e.target); });
}

async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = "copied";
  } catch {
    btn.textContent = "copy failed";
  }
  setTimeout(() => { btn.textContent = "copy"; }, 1200);
}

async function pollHealth() {
  try {
    const r = await fetch(`${apiBase()}/health`, { cache: "no-store" });
    if (!r.ok) throw new Error(String(r.status));
    if (health !== "serving") setHealth("up");
  } catch {
    setHealth("down");
  }
}

async function probe() {
  const body = { state: "probe", questions: { p: { type: "noul", instructions: "probe" } } };
  try {
    const r = await fetch(`${apiBase()}/v1/systemone`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
    if (r.ok) { setHealth("serving"); return; }
    const data = await r.json().catch(() => null);
    if (r.status === 422) setHealth("up", `Model not ready: ${formatDetail(data?.detail)}`);
    else if (r.status === 401) setHealth("up", "Von up. API key required for inference.");
    else setHealth("up", `Von up, inference returned HTTP ${r.status}`);
  } catch {
    setHealth("down");
  }
}

function initHealth() {
  pollHealth().then(probe);
  setInterval(pollHealth, 10000);
  $("#api-url").addEventListener("change", () => { setHealth("unknown"); pollHealth().then(probe); });
}

function setMode(next) {
  if (next === mode) return;
  clearRunError();
  if (next === "raw") {
    $("#raw").value = JSON.stringify(buildRequest(draft), null, 2);
  } else {
    let parsed;
    try {
      parsed = parseRequest($("#raw").value);
    } catch (e) {
      showRunError(e.message);
      return;
    }
    draft = parsed;
    $("#state").value = draft.state;
    renderQuestions();
  }
  mode = next;
  $("#tab-form").classList.toggle("active", mode === "form");
  $("#tab-raw").classList.toggle("active", mode === "raw");
  $("#form-view").classList.toggle("hidden", mode === "raw");
  $("#raw-view").classList.toggle("hidden", mode === "form");
  $("#state").disabled = mode === "raw";
  refreshErrors();
}

function initTabs() {
  $("#tab-form").addEventListener("click", () => setMode("form"));
  $("#tab-raw").addEventListener("click", () => setMode("raw"));
}

function initShortcuts() {
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      if (!$("#run").disabled) run();
    }
  });
}

initToolbar();
initState();
initQuestions();
initTabs();
initShortcuts();
initHealth();
$("#run").addEventListener("click", run);
refreshErrors();
