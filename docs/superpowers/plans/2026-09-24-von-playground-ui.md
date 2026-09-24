# Von Playground UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static single-page playground, served by nginx from Docker Compose, that sends `state` + `questions` to Von's `POST /v1/systemone` and renders the answers.

**Architecture:** Three static files under `ui/`. `model.js` holds pure functions (request building, validation, raw-JSON parsing, curl export, presets) and is unit-tested with Node's built-in test runner. `app.js` owns the DOM: renders the draft, delegates events, calls Von with `fetch`, renders results and health. `index.html` + `style.css` give layout. A `playground` service in `docker-compose.yml` bind-mounts `ui/` into `nginx:alpine`.

**Tech Stack:** Vanilla ES2020 JavaScript as ES modules, plain CSS, `nginx:alpine`, Node 26 (`node --test`) for unit tests only. No npm, no bundler.

**Spec:** `docs/superpowers/specs/2026-09-24-von-playground-ui-design.md`

**Repo note:** this directory is not a git repository. Skip commit steps; there is nothing to commit to. If the user initialises git later, commit after each task with the message given.

## Global Constraints

- No build step, no npm, no framework. `ui/` is served as-is.
- Nothing persisted except the API base URL under `localStorage` key `von-playground.api`. The API key stays in memory.
- Request `model` is always `"von-latest"`.
- Answer kind is detected from `answer.type`, never from the draft.
- Confidence badge bands: `>= 0.8` green, `>= 0.5` amber, else red.
- Never use `window.confirm`, `alert`, or `prompt`.
- Default API base URL `http://localhost:8000`. Playground port `${PLAYGROUND_PORT:-3000}` bound to `${PLAYGROUND_BIND_ADDRESS:-127.0.0.1}`.
- Health dot states: `unknown` grey, `down` red, `up` amber, `serving` green.
- Error copy (verbatim): 401 → `API key required or wrong. Set it in the toolbar.`; network or 5xx → `Von unreachable at {api}`.
- Test command: `node --test ui/model.test.js`. Syntax check: `node --check ui/app.js`.

## File map

| File | Responsibility |
|---|---|
| `ui/index.html` | Static structure: toolbar, confirm bar, three panels, tabs. Loads `app.js` as module. |
| `ui/style.css` | Layout (3-column grid, stacked on narrow), cards, bars, badges, dot colours. |
| `ui/model.js` | Pure: `newId`, `newQuestion`, `emptyDraft`, `isDraftEmpty`, `parseState`, `stateToText`, `buildQuestion`, `buildRequest`, `validate`, `parseRequest`, `formatDetail`, `toCurl`, `PRESETS`. No DOM access. |
| `ui/model.test.js` | `node:test` unit tests for `model.js`. |
| `ui/app.js` | DOM state, rendering, events, `fetch`, health polling, raw mode, keyboard shortcut. |
| `docker-compose.yml` | Add `playground` service. |
| `CLAUDE.md` | Document the service, URL, env vars, test command. |

---

### Task 1: Compose service and static scaffold

**Files:**
- Modify: `docker-compose.yml` (add service after `von`, before `volumes:`)
- Create: `ui/index.html`, `ui/style.css`, `ui/app.js`, `ui/model.js`

**Interfaces:**
- Produces: element ids every later task relies on: `#health`, `#api-url`, `#api-key`, `#preset`, `#reset`, `#run`, `#confirm`, `#confirm-yes`, `#confirm-no`, `#state`, `#tab-form`, `#tab-raw`, `#form-view`, `#raw-view`, `#raw`, `#questions`, `#add-question`, `#errors`, `#results`.

- [ ] **Step 1: Add the `playground` service to `docker-compose.yml`**

Insert directly above the top-level `volumes:` block:

```yaml
  playground:
    # Static single-page UI for /v1/systemone. No build: ./ui is served as-is.
    image: nginx:alpine
    ports:
      - "${PLAYGROUND_BIND_ADDRESS:-127.0.0.1}:${PLAYGROUND_PORT:-3000}:80"
    volumes:
      - ./ui:/usr/share/nginx/html:ro
    restart: unless-stopped
```

- [ ] **Step 2: Create `ui/index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Von Playground</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header class="toolbar">
    <span id="health" class="dot unknown" title="not checked yet"></span>
    <strong class="brand">Von Playground</strong>
    <input id="api-url" type="url" placeholder="http://localhost:8000" title="API base URL" spellcheck="false">
    <input id="api-key" type="password" placeholder="API key (optional)" autocomplete="off">
    <span class="spacer"></span>
    <select id="preset" title="Load a preset">
      <option value="">Presets…</option>
    </select>
    <button id="reset" type="button">Reset</button>
    <button id="run" type="button" class="primary">Run</button>
  </header>

  <div id="confirm" class="confirm hidden">
    Replace current draft?
    <button id="confirm-yes" type="button">Yes</button>
    <button id="confirm-no" type="button">No</button>
  </div>

  <main class="grid">
    <section class="panel">
      <h2>State</h2>
      <textarea id="state" placeholder="Text, or a JSON object / array" spellcheck="false"></textarea>
    </section>

    <section class="panel">
      <div class="tabs">
        <button id="tab-form" type="button" class="tab active">Form</button>
        <button id="tab-raw" type="button" class="tab">Raw request</button>
      </div>
      <div id="form-view">
        <h2>Questions</h2>
        <div id="questions"></div>
        <button id="add-question" type="button">+ question</button>
      </div>
      <div id="raw-view" class="hidden">
        <textarea id="raw" spellcheck="false"></textarea>
      </div>
      <ul id="errors" class="errors"></ul>
    </section>

    <section class="panel">
      <h2>Results</h2>
      <div id="results"><p class="muted">No run yet.</p></div>
    </section>
  </main>

  <script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 3: Create `ui/style.css`**

```css
:root {
  --bg: #0f1115;
  --panel: #171a21;
  --card: #1e222b;
  --border: #2b303b;
  --text: #e6e8ee;
  --muted: #8b93a7;
  --accent: #4f8cff;
  --green: #3ddc84;
  --amber: #f5b942;
  --red: #ff5c5c;
  --grey: #6b7280;
}
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.4 system-ui, sans-serif; }
h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 0 0 8px; }
button, input, select, textarea { font: inherit; color: inherit; }
button { background: var(--card); border: 1px solid var(--border); border-radius: 6px; padding: 6px 10px; cursor: pointer; }
button:hover { border-color: var(--accent); }
button:disabled { opacity: .5; cursor: not-allowed; }
button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
button.icon { padding: 2px 8px; line-height: 1; }
input, select, textarea { background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 6px 8px; width: 100%; }
textarea { resize: vertical; min-height: 64px; }
.hidden { display: none !important; }
.muted { color: var(--muted); }

.toolbar { display: flex; gap: 8px; align-items: center; padding: 10px 16px; border-bottom: 1px solid var(--border); background: var(--panel); flex-wrap: wrap; }
.toolbar input { width: auto; }
#api-url { width: 220px; }
#api-key { width: 180px; }
.spacer { flex: 1; }
.dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }
.dot.unknown { background: var(--grey); }
.dot.down { background: var(--red); }
.dot.up { background: var(--amber); }
.dot.serving { background: var(--green); }

.confirm { padding: 8px 16px; background: #3a2f12; border-bottom: 1px solid var(--amber); display: flex; gap: 8px; align-items: center; }

.grid { display: grid; grid-template-columns: 1fr; gap: 16px; padding: 16px; }
@media (min-width: 1100px) { .grid { grid-template-columns: 1fr 1.4fr 1.2fr; } }
.panel { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 12px; min-height: 300px; }
#state { min-height: 240px; }
#raw { min-height: 400px; font-family: ui-monospace, monospace; font-size: 12px; }

.tabs { display: flex; gap: 4px; margin-bottom: 8px; }
.tab { background: transparent; border-color: transparent; color: var(--muted); }
.tab.active { background: var(--card); border-color: var(--border); color: var(--text); }

.card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 10px; margin-bottom: 10px; }
.card-head { display: flex; gap: 6px; margin-bottom: 6px; }
.card-head .q-name { flex: 1; }
.card-head .q-type { width: auto; }
.card textarea { margin-bottom: 6px; min-height: 48px; }
.row { display: flex; gap: 6px; margin-bottom: 6px; align-items: center; }
.row .level-no { width: 20px; text-align: right; color: var(--muted); }
.add-row { margin-top: 2px; }

.errors { margin: 8px 0 0; padding-left: 18px; color: var(--red); }
.errors:empty { display: none; }
#run-error { color: var(--red); margin-top: 8px; white-space: pre-wrap; }

.answer h3 { margin: 0 0 6px; font-size: 14px; display: flex; gap: 8px; align-items: center; }
.answer .type { color: var(--muted); font-weight: normal; font-size: 12px; }
.badge { font-size: 11px; padding: 2px 6px; border-radius: 10px; color: #000; margin-left: auto; }
.badge.green { background: var(--green); }
.badge.amber { background: var(--amber); }
.badge.red { background: var(--red); }
.bar { display: grid; grid-template-columns: 1fr 3fr 48px; gap: 8px; align-items: center; margin: 3px 0; font-size: 13px; }
.bar .label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar .track { height: 10px; background: var(--bg); border-radius: 5px; overflow: hidden; }
.bar .fill { height: 100%; background: var(--grey); }
.bar.win .label { font-weight: bold; }
.bar.win .fill { background: var(--accent); }
.bar .pct { text-align: right; color: var(--muted); }
.headline { font-size: 22px; margin: 4px 0 8px; }
.headline small { color: var(--muted); font-size: 13px; }
.footer { display: flex; gap: 14px; flex-wrap: wrap; color: var(--muted); font-size: 12px; margin-top: 10px; }
details { margin-top: 8px; }
pre { background: var(--bg); padding: 8px; border-radius: 6px; overflow: auto; font-size: 12px; max-height: 320px; }
```

- [ ] **Step 4: Create placeholder modules**

`ui/model.js`:

```js
// Pure request/response helpers for the Von playground. No DOM access.
export const VERSION = 1;
```

`ui/app.js`:

```js
import { VERSION } from "./model.js";
console.log("von playground", VERSION);
```

- [ ] **Step 5: Start the service and verify it serves the page**

Run:

```bash
cd /home/majzok/ai/jev-local && docker compose up -d playground && sleep 1 && curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/ && curl -s localhost:3000/app.js
```

Expected: `200` then the two-line `app.js` content. Open `http://localhost:3000` in a browser: dark page with toolbar, three panels, console shows `von playground 1`.

- [ ] **Step 6: Commit (skip, not a git repo)**

Message if committing: `feat(ui): scaffold playground service and static page`

---

### Task 2: `model.js` request building

**Files:**
- Modify: `ui/model.js` (replace placeholder)
- Create: `ui/model.test.js`

**Interfaces:**
- Produces:
  - `newId(): string`
  - `newQuestion(type = "choice"): Question` where `Question` is `{ id, name, type, instructions }` plus `criteria: [{key, description}]` for choice, `levels: string[]` for score, `trueText, falseText` for noul.
  - `emptyDraft(): { state: "", questions: [] }`
  - `isDraftEmpty(draft): boolean`
  - `parseState(text): string | object | array`
  - `stateToText(state): string`
  - `buildQuestion(q): object` (wire shape)
  - `buildRequest(draft): { model: "von-latest", state, questions }`

- [ ] **Step 1: Write failing tests**

`ui/model.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newQuestion, emptyDraft, isDraftEmpty, parseState, stateToText,
  buildQuestion, buildRequest,
} from "./model.js";

test("parseState: JSON object text becomes object", () => {
  assert.deepEqual(parseState(' {"body": "hi"} '), { body: "hi" });
});

test("parseState: JSON array text becomes array", () => {
  assert.deepEqual(parseState("[1, 2]"), [1, 2]);
});

test("parseState: plain text is trimmed and kept as string", () => {
  assert.equal(parseState("  billed twice  "), "billed twice");
});

test("parseState: broken JSON is kept as string", () => {
  assert.equal(parseState("{not json"), "{not json");
});

test("stateToText: string passthrough, object pretty-printed", () => {
  assert.equal(stateToText("x"), "x");
  assert.equal(stateToText({ a: 1 }), '{\n  "a": 1\n}');
});

test("newQuestion: defaults per type", () => {
  const c = newQuestion("choice");
  assert.equal(c.type, "choice");
  assert.equal(c.criteria.length, 2);
  const s = newQuestion("score");
  assert.deepEqual(s.levels, ["", ""]);
  const n = newQuestion("noul");
  assert.equal(n.trueText, "");
  assert.equal(n.falseText, "");
  assert.notEqual(c.id, s.id);
});

test("isDraftEmpty", () => {
  assert.equal(isDraftEmpty(emptyDraft()), true);
  assert.equal(isDraftEmpty({ state: " x", questions: [] }), false);
  assert.equal(isDraftEmpty({ state: "", questions: [newQuestion()] }), false);
});

test("buildQuestion: choice maps empty description to null", () => {
  const q = { ...newQuestion("choice"), instructions: "which?", criteria: [
    { key: "billing", description: "refunds" }, { key: "tech", description: "  " },
  ] };
  assert.deepEqual(buildQuestion(q), {
    type: "choice", instructions: "which?", criteria: { billing: "refunds", tech: null },
  });
});

test("buildQuestion: score sends levels array", () => {
  const q = { ...newQuestion("score"), instructions: "how?", levels: ["calm", "furious"] };
  assert.deepEqual(buildQuestion(q), { type: "score", instructions: "how?", criteria: ["calm", "furious"] });
});

test("buildQuestion: noul omits criteria when both texts empty", () => {
  const q = { ...newQuestion("noul"), instructions: "cancel?" };
  assert.deepEqual(buildQuestion(q), { type: "noul", instructions: "cancel?" });
});

test("buildQuestion: noul includes criteria when any text set", () => {
  const q = { ...newQuestion("noul"), instructions: "cancel?", trueText: "threatens to leave" };
  assert.deepEqual(buildQuestion(q), {
    type: "noul", instructions: "cancel?", criteria: { true: "threatens to leave", false: "" },
  });
});

test("buildRequest: envelope with von-latest and questions keyed by name", () => {
  const draft = { state: '{"body":"hi"}', questions: [
    { ...newQuestion("noul"), name: "churn", instructions: "cancel?" },
  ] };
  assert.deepEqual(buildRequest(draft), {
    model: "von-latest",
    state: { body: "hi" },
    questions: { churn: { type: "noul", instructions: "cancel?" } },
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/majzok/ai/jev-local && node --test ui/model.test.js`
Expected: FAIL, `SyntaxError: The requested module './model.js' does not provide an export named 'buildQuestion'` (or similar missing export).

- [ ] **Step 3: Implement**

Replace `ui/model.js` with:

```js
// Pure request/response helpers for the Von playground. No DOM access.

export function newId() {
  return Math.random().toString(36).slice(2, 10);
}

export function newQuestion(type = "choice") {
  const base = { id: newId(), name: "", type, instructions: "" };
  if (type === "choice") {
    return { ...base, criteria: [{ key: "", description: "" }, { key: "", description: "" }] };
  }
  if (type === "score") return { ...base, levels: ["", ""] };
  return { ...base, trueText: "", falseText: "" };
}

export function emptyDraft() {
  return { state: "", questions: [] };
}

export function isDraftEmpty(draft) {
  return draft.state.trim() === "" && draft.questions.length === 0;
}

// Von accepts a string, object, or array as state. JSON-looking text is sent parsed.
export function parseState(text) {
  const t = text.trim();
  if (t.startsWith("{") || t.startsWith("[")) {
    try {
      const v = JSON.parse(t);
      if (v && typeof v === "object") return v;
    } catch {
      // fall through: treat as plain text
    }
  }
  return t;
}

export function stateToText(state) {
  return typeof state === "string" ? state : JSON.stringify(state, null, 2);
}

export function buildQuestion(q) {
  const out = { type: q.type, instructions: q.instructions };
  if (q.type === "choice") {
    out.criteria = {};
    for (const c of q.criteria) out.criteria[c.key] = c.description.trim() === "" ? null : c.description;
  } else if (q.type === "score") {
    out.criteria = q.levels.slice();
  } else if (q.trueText.trim() !== "" || q.falseText.trim() !== "") {
    out.criteria = { true: q.trueText, false: q.falseText };
  }
  return out;
}

export function buildRequest(draft) {
  const questions = {};
  for (const q of draft.questions) questions[q.name] = buildQuestion(q);
  return { model: "von-latest", state: parseState(draft.state), questions };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/majzok/ai/jev-local && node --test ui/model.test.js`
Expected: all 12 tests pass, `# fail 0`.

- [ ] **Step 5: Commit (skip, not a git repo)**

Message: `feat(ui): request builders in model.js`

---

### Task 3: `model.js` validation

**Files:**
- Modify: `ui/model.js` (append)
- Modify: `ui/model.test.js` (append)

**Interfaces:**
- Produces: `validate(draft): string[]` (empty array means valid).

- [ ] **Step 1: Write failing tests**

Append to `ui/model.test.js` (add `validate` to the import list):

```js
test("validate: empty draft reports state and questions", () => {
  assert.deepEqual(validate(emptyDraft()), ["State is empty.", "Add at least one question."]);
});

test("validate: valid draft returns no errors", () => {
  const draft = { state: "hi", questions: [
    { ...newQuestion("choice"), name: "dept", instructions: "which?", criteria: [
      { key: "a", description: "" }, { key: "b", description: "" } ] },
    { ...newQuestion("score"), name: "anger", instructions: "how?", levels: ["calm", "mad"] },
    { ...newQuestion("noul"), name: "churn", instructions: "cancel?" },
  ] };
  assert.deepEqual(validate(draft), []);
});

test("validate: names must be non-empty and unique", () => {
  const draft = { state: "hi", questions: [
    { ...newQuestion("noul"), name: "", instructions: "x" },
    { ...newQuestion("noul"), name: "dup", instructions: "x" },
    { ...newQuestion("noul"), name: "dup", instructions: "x" },
  ] };
  assert.deepEqual(validate(draft), [
    "Question 1: name is empty.",
    '"dup": duplicate name.',
  ]);
});

test("validate: instructions required", () => {
  const draft = { state: "hi", questions: [{ ...newQuestion("noul"), name: "q", instructions: " " }] };
  assert.deepEqual(validate(draft), ['"q": instructions are empty.']);
});

test("validate: choice needs 2+ options with unique non-empty keys", () => {
  const one = { state: "hi", questions: [{ ...newQuestion("choice"), name: "q", instructions: "x",
    criteria: [{ key: "a", description: "" }] }] };
  assert.deepEqual(validate(one), ['"q": needs at least 2 options.']);
  const blank = { state: "hi", questions: [{ ...newQuestion("choice"), name: "q", instructions: "x",
    criteria: [{ key: "a", description: "" }, { key: " ", description: "" }] }] };
  assert.deepEqual(validate(blank), ['"q": an option key is empty.']);
  const dup = { state: "hi", questions: [{ ...newQuestion("choice"), name: "q", instructions: "x",
    criteria: [{ key: "a", description: "" }, { key: "a", description: "" }] }] };
  assert.deepEqual(validate(dup), ['"q": duplicate option key "a".']);
});

test("validate: score needs 2 to 10 non-empty levels", () => {
  const mk = (levels) => ({ state: "hi", questions: [{ ...newQuestion("score"), name: "q", instructions: "x", levels }] });
  assert.deepEqual(validate(mk(["a"])), ['"q": needs 2 to 10 levels.']);
  assert.deepEqual(validate(mk(Array(11).fill("l"))), ['"q": needs 2 to 10 levels.']);
  assert.deepEqual(validate(mk(["a", ""])), ['"q": a level is empty.']);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/majzok/ai/jev-local && node --test ui/model.test.js`
Expected: FAIL, missing export `validate`.

- [ ] **Step 3: Implement**

Append to `ui/model.js`:

```js
export function validate(draft) {
  const errors = [];
  if (draft.state.trim() === "") errors.push("State is empty.");
  if (draft.questions.length === 0) errors.push("Add at least one question.");
  const names = new Set();
  draft.questions.forEach((q, i) => {
    const label = q.name.trim() === "" ? `Question ${i + 1}` : `"${q.name}"`;
    if (q.name.trim() === "") errors.push(`${label}: name is empty.`);
    else if (names.has(q.name)) errors.push(`${label}: duplicate name.`);
    names.add(q.name);
    if (q.instructions.trim() === "") errors.push(`${label}: instructions are empty.`);
    if (q.type === "choice") {
      if (q.criteria.length < 2) errors.push(`${label}: needs at least 2 options.`);
      const keys = new Set();
      for (const c of q.criteria) {
        if (c.key.trim() === "") { errors.push(`${label}: an option key is empty.`); break; }
        if (keys.has(c.key)) { errors.push(`${label}: duplicate option key "${c.key}".`); break; }
        keys.add(c.key);
      }
    } else if (q.type === "score") {
      if (q.levels.length < 2 || q.levels.length > 10) errors.push(`${label}: needs 2 to 10 levels.`);
      if (q.levels.some((l) => l.trim() === "")) errors.push(`${label}: a level is empty.`);
    }
  });
  return errors;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/majzok/ai/jev-local && node --test ui/model.test.js`
Expected: `# fail 0`.

- [ ] **Step 5: Commit (skip)**

Message: `feat(ui): draft validation`

---

### Task 4: `model.js` raw-request parsing and 422 detail formatting

**Files:**
- Modify: `ui/model.js` (append)
- Modify: `ui/model.test.js` (append)

**Interfaces:**
- Produces:
  - `parseRequest(json: string): { state: string, questions: Question[] }`, throws `Error` with a user-facing message.
  - `formatDetail(detail): string` turns a 422 `detail` (string, or pydantic array of `{loc, msg}`) into one string.

- [ ] **Step 1: Write failing tests**

Append to `ui/model.test.js` (add `parseRequest, formatDetail` to imports):

```js
test("parseRequest: round-trips a built request", () => {
  const draft = { state: "hello", questions: [
    { ...newQuestion("choice"), name: "dept", instructions: "which?", criteria: [
      { key: "billing", description: "refunds" }, { key: "tech", description: "" } ] },
    { ...newQuestion("score"), name: "anger", instructions: "how?", levels: ["calm", "mad"] },
    { ...newQuestion("noul"), name: "churn", instructions: "cancel?", trueText: "leaves", falseText: "stays" },
  ] };
  const back = parseRequest(JSON.stringify(buildRequest(draft)));
  assert.equal(back.state, "hello");
  assert.equal(back.questions.length, 3);
  const [c, s, n] = back.questions;
  assert.equal(c.name, "dept");
  assert.deepEqual(c.criteria, [{ key: "billing", description: "refunds" }, { key: "tech", description: "" }]);
  assert.deepEqual(s.levels, ["calm", "mad"]);
  assert.equal(n.trueText, "leaves");
  assert.equal(n.falseText, "stays");
  assert.ok(c.id && s.id && n.id);
});

test("parseRequest: object state becomes pretty JSON text", () => {
  const back = parseRequest('{"state":{"body":"x"},"questions":{"q":{"type":"noul","instructions":"i"}}}');
  assert.equal(back.state, '{\n  "body": "x"\n}');
  assert.equal(back.questions[0].trueText, "");
});

test("parseRequest: structured instructions are stringified", () => {
  const back = parseRequest('{"state":"s","questions":{"q":{"type":"noul","instructions":{"k":1}}}}');
  assert.equal(back.questions[0].instructions, '{"k":1}');
});

test("parseRequest: errors", () => {
  assert.throws(() => parseRequest("{nope"), /Invalid JSON/);
  assert.throws(() => parseRequest("[]"), /must be a JSON object/);
  assert.throws(() => parseRequest('{"questions":{}}'), /Missing "state"/);
  assert.throws(() => parseRequest('{"state":"s","questions":[]}'), /"questions" must be an object/);
  assert.throws(() => parseRequest('{"state":"s","questions":{"q":{"type":"choice","instructions":"i"}}}'),
    /choice needs a criteria object/);
  assert.throws(() => parseRequest('{"state":"s","questions":{"q":{"type":"score","instructions":"i","criteria":{}}}}'),
    /score needs a criteria array/);
  assert.throws(() => parseRequest('{"state":"s","questions":{"q":{"type":"magic","instructions":"i"}}}'),
    /unknown type "magic"/);
});

test("formatDetail: string passthrough, pydantic array joined", () => {
  assert.equal(formatDetail("boom"), "boom");
  assert.equal(formatDetail([
    { loc: ["body", "questions"], msg: "Field required" },
    { loc: ["body", "state"], msg: "Field required" },
  ]), "body.questions: Field required\nbody.state: Field required");
  assert.equal(formatDetail(undefined), "Unprocessable request (422).");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/majzok/ai/jev-local && node --test ui/model.test.js`
Expected: FAIL, missing exports `parseRequest`, `formatDetail`.

- [ ] **Step 3: Implement**

Append to `ui/model.js`:

```js
export function parseRequest(json) {
  let body;
  try {
    body = JSON.parse(json);
  } catch (e) {
    throw new Error(`Invalid JSON: ${e.message}`);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Request must be a JSON object.");
  if (!("state" in body)) throw new Error('Missing "state".');
  if (!body.questions || typeof body.questions !== "object" || Array.isArray(body.questions)) {
    throw new Error('"questions" must be an object.');
  }
  const questions = Object.entries(body.questions).map(([name, q]) => {
    if (!q || typeof q !== "object") throw new Error(`Question "${name}" must be an object.`);
    const instructions = typeof q.instructions === "string" ? q.instructions : JSON.stringify(q.instructions ?? "");
    const base = { id: newId(), name, type: q.type, instructions };
    if (q.type === "choice") {
      if (!q.criteria || typeof q.criteria !== "object" || Array.isArray(q.criteria)) {
        throw new Error(`Question "${name}": choice needs a criteria object.`);
      }
      return { ...base, criteria: Object.entries(q.criteria).map(([key, description]) => ({ key, description: description ?? "" })) };
    }
    if (q.type === "score") {
      if (!Array.isArray(q.criteria)) throw new Error(`Question "${name}": score needs a criteria array.`);
      return { ...base, levels: q.criteria.map((l) => (typeof l === "string" ? l : JSON.stringify(l))) };
    }
    if (q.type === "noul") {
      const c = q.criteria && typeof q.criteria === "object" ? q.criteria : {};
      return { ...base, trueText: c.true ?? "", falseText: c.false ?? "" };
    }
    throw new Error(`Question "${name}": unknown type "${q.type}".`);
  });
  return { state: stateToText(body.state), questions };
}

export function formatDetail(detail) {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((d) => `${(d.loc || []).join(".")}: ${d.msg}`).join("\n");
  }
  return "Unprocessable request (422).";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/majzok/ai/jev-local && node --test ui/model.test.js`
Expected: `# fail 0`.

- [ ] **Step 5: Commit (skip)**

Message: `feat(ui): raw request parsing and 422 detail formatting`

---

### Task 5: `model.js` curl export and presets

**Files:**
- Modify: `ui/model.js` (append)
- Modify: `ui/model.test.js` (append)

**Interfaces:**
- Produces:
  - `toCurl(apiBase: string, body: object, apiKey: string): string`
  - `PRESETS: { name: string, draft: { state: string, questions: Question[] } }[]` with exactly three entries named `Ticket triage`, `Review sentiment`, `Churn risk`.

- [ ] **Step 1: Write failing tests**

Append to `ui/model.test.js` (add `toCurl, PRESETS, validate` to imports if not already):

```js
test("toCurl: no auth header when key empty, single quotes escaped", () => {
  const out = toCurl("http://localhost:8000", { state: "it's", questions: {} }, "");
  assert.ok(out.startsWith("curl -s http://localhost:8000/v1/systemone \\\n  -H 'content-type: application/json' \\\n  -d '"));
  assert.ok(!out.includes("Authorization"));
  assert.ok(out.includes("it'\\''s"));
});

test("toCurl: auth header when key set", () => {
  const out = toCurl("http://x", { state: "s", questions: {} }, "k1");
  assert.ok(out.includes("-H 'Authorization: Bearer k1'"));
});

test("PRESETS: three, one per type, each valid", () => {
  assert.deepEqual(PRESETS.map((p) => p.name), ["Ticket triage", "Review sentiment", "Churn risk"]);
  assert.deepEqual(PRESETS.map((p) => p.draft.questions[0].type), ["choice", "score", "noul"]);
  for (const p of PRESETS) assert.deepEqual(validate(p.draft), [], p.name);
  assert.equal(PRESETS[1].draft.questions[0].levels.length, 5);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/majzok/ai/jev-local && node --test ui/model.test.js`
Expected: FAIL, missing exports `toCurl`, `PRESETS`.

- [ ] **Step 3: Implement**

Append to `ui/model.js`:

```js
export function toCurl(apiBase, body, apiKey) {
  const auth = apiKey ? ` \\\n  -H 'Authorization: Bearer ${apiKey}'` : "";
  const json = JSON.stringify(body, null, 2).replace(/'/g, "'\\''");
  return `curl -s ${apiBase}/v1/systemone \\\n  -H 'content-type: application/json'${auth} \\\n  -d '${json}'`;
}

function preset(name, state, questions) {
  return { name, draft: { state, questions: questions.map((q) => ({ ...newQuestion(q.type), ...q, id: newId() })) } };
}

export const PRESETS = [
  preset("Ticket triage", "billed twice this month, refund please or we cancel", [
    { type: "choice", name: "dept", instructions: "Which team should handle this ticket?", criteria: [
      { key: "billing", description: "payments, invoices, refunds" },
      { key: "tech", description: "bugs, crashes, login problems" },
      { key: "sales", description: "pricing, upgrades, new plans" },
    ] },
  ]),
  preset("Review sentiment", "Shipping was slow but the product itself is solid and support answered fast.", [
    { type: "score", name: "sentiment", instructions: "How positive is this review?", levels: [
      "very negative", "negative", "neutral", "positive", "very positive",
    ] },
  ]),
  preset("Churn risk", '{"body": "this is the third outage this week, we are evaluating alternatives", "plan": "enterprise"}', [
    { type: "noul", name: "churn", instructions: "Is this customer likely to cancel?",
      trueText: "threatens to leave, mentions competitors, repeated failures",
      falseText: "routine question, satisfied tone" },
  ]),
];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/majzok/ai/jev-local && node --test ui/model.test.js`
Expected: `# fail 0`, 26 tests total.

- [ ] **Step 5: Commit (skip)**

Message: `feat(ui): curl export and presets`

---

### Task 6: `app.js` form editing

**Files:**
- Modify: `ui/app.js` (replace placeholder)

**Interfaces:**
- Consumes: everything exported from `model.js` in Tasks 2 to 5.
- Produces (module-level, used by Tasks 7 and 8): `draft`, `mode` (`"form"` | `"raw"`), `apiKey`, `apiBase()`, `esc()`, `refreshErrors()`, `renderQuestions()`, `loadDraft(d)`.

No unit tests here (DOM). Verification is manual in the browser at the end of the task.

- [ ] **Step 1: Write the module skeleton, toolbar wiring, and state textarea**

Replace `ui/app.js` with:

```js
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
```

- [ ] **Step 2: Add question card rendering**

Append to `ui/app.js`:

```js
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
```

- [ ] **Step 3: Add event delegation for edits and structural changes**

Append to `ui/app.js`:

```js
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
```

- [ ] **Step 4: Syntax check and manual verification**

Run: `cd /home/majzok/ai/jev-local && node --check ui/app.js && node --test ui/model.test.js`
Expected: no syntax error, tests still pass.

Open `http://localhost:3000` (hard refresh). Verify:
- Errors list shows `State is empty.` and `Add at least one question.`; Run disabled.
- `+ question` adds a choice card; typing a name and instructions and two keys clears its errors.
- Type select switches to score (two numbered levels with arrows) and noul (two textareas), keeping name and instructions.
- `+ option` / `+ level`, `×`, `↑` `↓` work; typing does not lose focus.
- Presets menu loads each preset; with a non-empty draft, the yellow confirm bar appears; No keeps draft, Yes replaces.
- Reset clears (with confirm if non-empty).

- [ ] **Step 5: Commit (skip)**

Message: `feat(ui): form editing for state and questions`

---

### Task 7: `app.js` run, results, footer, copy actions, errors

**Files:**
- Modify: `ui/app.js` (append, and edit the init block at the bottom)

**Interfaces:**
- Consumes: `draft`, `mode`, `apiKey`, `apiBase()`, `esc()` from Task 6; `buildRequest`, `validate`, `formatDetail`, `toCurl` from `model.js`.
- Produces: `run()`, `setHealth(state, tip)` (used by Task 8), `headers()`.

- [ ] **Step 1: Add health setter, headers, and run**

Insert above the `initToolbar();` line at the bottom of `ui/app.js`:

```js
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
    if (!res.ok) { showRunError(`Von unreachable at ${apiBase()} (HTTP ${res.status})`); return; }
    setHealth("serving");
    renderResults(data, body, ms);
  } catch {
    showRunError(`Von unreachable at ${apiBase()}`);
  } finally {
    setPending(false);
  }
}
```

- [ ] **Step 2: Add results rendering**

Insert below `run()`:

```js
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
    body = `<div class="headline">${pct(a.noul)} <small>P(true)</small></div>` + bar("true", a.noul, a.noul >= 0.5);
  } else {
    body = `<pre>${esc(JSON.stringify(a, null, 2))}</pre>`;
  }
  return `<div class="card answer">
    <h3>${esc(name)} <span class="type">${esc(a.type ?? "?")}</span>${head}</h3>
    ${body}
  </div>`;
}

function renderResults(data, request, ms) {
  const answers = Object.entries(data.answers || {}).map(([n, a]) => answerCard(n, a)).join("");
  const u = data.usage || {};
  $("#results").innerHTML = `
    ${answers}
    <div class="footer">
      <span>model <b>${esc(data.model ?? "?")}</b></span>
      <span>in <b>${u.input_tokens ?? "?"}</b> tok</span>
      <span>out <b>${u.output_tokens ?? "?"}</b> tok</span>
      <span>time <b>${ms}</b> ms</span>
    </div>
    <details>
      <summary>Raw JSON <button type="button" class="icon" id="copy-json">copy</button></summary>
      <pre id="raw-json">${esc(JSON.stringify(data, null, 2))}</pre>
    </details>
    <details>
      <summary>curl <button type="button" class="icon" id="copy-curl">copy</button></summary>
      <pre id="curl-text">${esc(toCurl(apiBase(), request, apiKey))}</pre>
    </details>`;
  $("#copy-json").addEventListener("click", (e) => { e.preventDefault(); copyText($("#raw-json").textContent, e.target); });
  $("#copy-curl").addEventListener("click", (e) => { e.preventDefault(); copyText($("#curl-text").textContent, e.target); });
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
```

- [ ] **Step 3: Wire the Run button**

In the init block at the bottom of `ui/app.js`, add before `refreshErrors();`:

```js
$("#run").addEventListener("click", run);
```

- [ ] **Step 4: Syntax check and manual verification**

Run: `cd /home/majzok/ai/jev-local && node --check ui/app.js && node --test ui/model.test.js`
Expected: clean.

In the browser (hard refresh), with the `von` container healthy:
- Load "Ticket triage", Run: three bars, `billing` bold and blue, confidence badge, footer shows `model von-1.2.0`, in/out tokens, time in ms.
- Load "Review sentiment", Run: headline score with `of 0 to 4`, five bars with legend text, argmax highlighted.
- Load "Churn risk", Run: headline percentage and one bar, no badge.
- Open "Raw JSON", copy works. Open "curl", copy, paste into a terminal: returns the same answer.
- Break a preset: score with only one level shows `Question ...: needs 2 to 10 levels.` and Run disabled (client validation). To test the server 422 path, use raw mode in Task 8.
- Change API URL to `http://localhost:9` and Run: `Von unreachable at http://localhost:9`.

- [ ] **Step 5: Commit (skip)**

Message: `feat(ui): run requests and render answers`

---

### Task 8: `app.js` health polling, probe, raw mode, keyboard shortcut

**Files:**
- Modify: `ui/app.js` (append, and edit the init block)

**Interfaces:**
- Consumes: `setHealth`, `health`, `run`, `headers`, `apiBase`, `draft`, `mode`, `renderQuestions`, `refreshErrors`, `showRunError`, `clearRunError` from Tasks 6 and 7; `buildRequest`, `parseRequest` from `model.js`.

- [ ] **Step 1: Add health polling and the one-off probe**

Insert above the init block:

```js
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
```

- [ ] **Step 2: Add raw mode tabs**

Insert above the init block:

```js
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
```

- [ ] **Step 3: Extend the init block**

The bottom of `ui/app.js` must now read:

```js
initToolbar();
initState();
initQuestions();
initTabs();
initShortcuts();
initHealth();
$("#run").addEventListener("click", run);
refreshErrors();
```

- [ ] **Step 4: Syntax check and manual verification**

Run: `cd /home/majzok/ai/jev-local && node --check ui/app.js && node --test ui/model.test.js`
Expected: clean.

Browser (hard refresh):
- Dot goes grey → amber → green within a second while `von` is healthy. Hover shows `Von serving`.
- `docker compose stop von`: within 10 s dot turns red. `docker compose start von`: dot turns amber (liveness ok), then after a Run or reload, green.
- Load "Ticket triage", click "Raw request": textarea shows the full body. Change a question's `type` to `"magic"` and Run: server 422 `detail` text appears under the tabs. (Von accepts a one-level score, so that is not a 422 trigger.)
- Click "Form" with valid raw JSON: form rebuilt with the same questions; state textarea re-enabled. Click "Form" with broken JSON: error shown, stays in raw mode.
- `Ctrl+Enter` in any textarea runs.
- With `VON_API_KEY=secret docker compose up -d von` (recreates the container; weights are cached so it is fast): Run with empty key shows `API key required or wrong. Set it in the toolbar.`; typing `secret` into the key field and running succeeds; the curl export now includes the Authorization header. Afterwards restore with `docker compose up -d von` without the variable.

- [ ] **Step 5: Commit (skip)**

Message: `feat(ui): health dot, raw request mode, keyboard shortcut`

---

### Task 9: Documentation and final verification

**Files:**
- Modify: `CLAUDE.md` (sections "What this is", "Commands", "Configuration")
- Modify: `docs/superpowers/specs/2026-09-24-von-playground-ui-design.md` (Testing section)

- [ ] **Step 1: Update `CLAUDE.md`**

In "What this is", replace the `Files:` line with:

```markdown
Files: `Dockerfile` (image), `docker-compose.yml` (services `von` and `playground`), `healthcheck.py` (readiness probe mounted into the container), `ui/` (static playground page served by `nginx:alpine`, no build step).
```

In "Commands", after the `curl -s localhost:8000/v1/models` line add:

```bash
open http://localhost:3000                # playground UI (service `playground`)
node --test ui/model.test.js                           # unit tests for ui/model.js (Node 18+, no deps)
node --check ui/app.js                    # syntax check for the DOM module
```

Add a new section after "Von behaviour that matters here":

```markdown
## Playground UI

`ui/` is a static page (`index.html`, `style.css`, `app.js`, `model.js`) served by the `playground` service. The browser calls Von directly at the API base URL shown in the toolbar (default `http://localhost:8000`, saved in `localStorage`, overridable with `?api=`); this works because Von's CORS default is `*`. `model.js` is pure and unit-tested; `app.js` is DOM only. Design spec: `docs/superpowers/specs/2026-09-24-von-playground-ui-design.md`.
```

In "Configuration", add:

```markdown
- `PLAYGROUND_PORT` (default 3000), `PLAYGROUND_BIND_ADDRESS` (default `127.0.0.1`): where the playground page is served. The page itself needs no configuration; the API URL and optional API key are entered in its toolbar (key is never persisted).
```

- [ ] **Step 2: Update the spec's Testing section**

Replace the first two bullets of "## Testing" in the spec with:

```markdown
- `ui/model.js` (pure helpers) is unit-tested with Node's built-in runner: `node --test ui/model.test.js`. No dependencies.
- `node --check ui/app.js` passes.
```

- [ ] **Step 3: Full verification pass**

Run:

```bash
cd /home/majzok/ai/jev-local && node --test ui/model.test.js && node --check ui/app.js && docker compose up -d && docker compose ps
```

Expected: tests pass, both services `Up`, `von` `(healthy)`.

Then, in the browser at `http://localhost:3000`, run all three presets, take one screenshot per answer type, and confirm the footer shows model, token counts, and ms.

- [ ] **Step 4: Commit (skip)**

Message: `docs: playground UI in CLAUDE.md and spec`
