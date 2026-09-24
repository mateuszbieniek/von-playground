import {
  newQuestion, emptyDraft, isDraftEmpty, buildRequest, validate, parseRequest,
  formatDetail, toCurl, PRESETS,
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
  draft = { state: d.state, questions: d.questions.map((q) => ({ ...q })) };
  $("#state").value = draft.state;
  renderQuestions();
  refreshErrors();
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

initToolbar();
initState();
initQuestions();
refreshErrors();
