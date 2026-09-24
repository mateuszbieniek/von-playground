# Laya Playground UI — Design

> **Superseded 2026-09-24:** replaced by `2026-09-24-von-playground-ui-design.md` after the backend moved from Laya to Von. Kept for reference only.

Date: 2026-09-24

## Goal

A single-page web playground, deployed alongside the Laya container, that lets a user author a `state` document and a set of `questions`, send them to Laya's `POST /v1/systemone` endpoint, and read the answers in a visual form.

## Constraints

- Laya (`laya/serve.py` upstream) has no CORS middleware. A browser page served from another origin cannot call it directly.
- Laya may require `Authorization: Bearer <LAYA_API_KEY>`. The key must not be shipped to the browser.
- The upstream Laya image is built from GitHub and must not be forked or modified.
- Stack fixed by the request: Vite, React, Tailwind, single HTML page.

## Architecture

```
browser ── :3000 ──> playground (nginx)
                        ├── /            static Vite bundle
                        └── /api/*  ──>  laya:8000/*   (+ Authorization header from env)
```

- `ui/` holds the Vite + React 19 + TypeScript + Tailwind v4 project.
- `ui/Dockerfile`: stage 1 `node:22-alpine` runs `npm ci && npm run build`; stage 2 `nginx:alpine` copies `dist/` and an nginx template. The template uses the official image's envsubst mechanism (`/etc/nginx/templates/default.conf.template`) to inject `LAYA_UPSTREAM` and `LAYA_API_KEY`.
- nginx rewrites `/api/(.*)` to `/$1` on the upstream and, when `LAYA_API_KEY` is non-empty, adds `Authorization: Bearer $LAYA_API_KEY`. Proxy read timeout 300s (CPU inference is slow).
- `docker-compose.yml` gains a `playground` service: `build: ./ui`, `depends_on: laya: condition: service_healthy`, port `${PLAYGROUND_BIND_ADDRESS:-127.0.0.1}:${PLAYGROUND_PORT:-3000}:80`, env `LAYA_UPSTREAM=http://laya:${LAYA_PORT:-8000}`, `LAYA_API_KEY=${LAYA_API_KEY:-}`.
- Dev workflow: `npm run dev` in `ui/`; `vite.config.ts` proxies `/api` to `process.env.LAYA_URL ?? "http://localhost:8000"` with the same path rewrite. The app always calls relative `/api/...` so the same bundle works in dev and in the container.

## Data model (ui/src/model.ts)

```ts
type StateRow = { id: string; key: string; value: string };
type ChoiceQuestion = { kind: "choice"; criteria: { id: string; key: string; description: string }[] };
type ScoreQuestion  = { kind: "score";  levels: { id: string; description: string }[] };
type NoulQuestion   = { kind: "noul";   falseText: string; trueText: string; labels?: { false: string; true: string } };
type Question = { id: string; name: string; instructions: string } & (ChoiceQuestion | ScoreQuestion | NoulQuestion);
type ModelChoice = "auto" | "english" | "multilingual" | "typed-decisions";
type Draft = { state: StateRow[] | { raw: Record<string, unknown> }; questions: Question[]; model: ModelChoice };
```

- `state` is either key/value rows (form mode) or an arbitrary JSON object (`raw`) when the user edits nested JSON that cannot be flattened to string rows. Switching back to form mode is allowed only when every top-level value is a string; otherwise the toggle is disabled with a tooltip.
- `toRequest(draft): SystemOneRequest` builds `{ state, questions, model? }` (`model` omitted when `auto`).
- `fromQuestionsJson(json): Question[] | Error` parses pasted JSON back into the typed model; unknown `type` or missing `criteria` is an error.
- Validation before send: at least one question, unique non-empty names, choice needs 2+ criteria, score needs 2+ levels, noul needs both texts. Errors listed under the Run button and Run disabled.

## Response model

```ts
type Answer =
  | { choice: string; confidence: number; probabilities: Record<string, number> }
  | { score: number;  confidence: number; distribution: number[] }
  | { noul: number;   confidence: number };
type SystemOneResponse = { answers: Record<string, Answer>; usage?: { input_tokens: number; output_tokens: number }; model?: string; routing?: unknown };
```

Answer kind is detected by which key is present (`choice` / `score` / `noul`), not by the question definition, so the result panel also renders responses restored from history.

## UI

Single page, three panels (`grid-cols-1 lg:grid-cols-3`), plus a top toolbar and a collapsible history sidebar.

**Toolbar**: health dot (polls `/api/health` every 10s; green = ok, amber = `loaded` empty, red = unreachable), model select, Presets menu, Reset, Run (also `Ctrl/Cmd+Enter`). Run shows a spinner and elapsed time while pending.

**State panel**: rows of key + multiline value, add/remove. "JSON" toggle swaps to a textarea with the object; parse on blur; parse error shown inline and model untouched until valid.

**Questions panel**: list of cards. Card header: name input, type select, delete. Body by type:
- choice: rows of key + description.
- score: ordered list of level descriptions (index shown as level number), move up/down.
- noul: two textareas (false / true) and an optional "labels" disclosure with two short inputs.
"JSON" toggle for the whole `questions` object, same parse-on-blur rule.

**Result panel**: one card per answer in request order.
- choice: winning key highlighted, one horizontal bar per option sorted by probability.
- score: expected level as number, bar per level from `distribution`, argmax highlighted.
- noul: single bar for p(true), with label text.
Each card shows a confidence badge (colour bands: ≥0.8 green, ≥0.5 amber, else red). Footer line: model, routing summary, input tokens, latency (client-measured). "Raw JSON" disclosure with pretty-printed response and a copy button. Also a "Copy as curl" button on the request.

**History sidebar**: last 20 runs (timestamp, question names, latency). Click restores the draft and shows the stored response. Clear-all button.

**Presets** (bundled in `ui/src/presets.ts`): "Ticket triage" (choice), "Review sentiment" (score, 5 levels), "Spam check" (noul). Loading a preset replaces the draft; if the draft is non-empty and differs from every preset, an inline "Replace current draft?" confirm (no `window.confirm`) is shown first.

## Persistence

`localStorage` keys `laya-playground.draft` and `laya-playground.history`, versioned (`{ v: 1, ... }`). Draft saved debounced 300ms. Corrupt or wrong-version entries are ignored and overwritten. History capped at 20 entries; each stores request, response, latency, timestamp.

## Errors

| Condition | UI |
|---|---|
| 400 / 422 | `detail` string shown under Run button |
| 401 | "Laya requires an API key. Set LAYA_API_KEY on the playground service." |
| 413 | "Request too large." |
| 5xx / network | "Laya unreachable or still loading" plus health status text |
| Invalid JSON in a JSON editor | inline error, form model unchanged |

## Testing

Vitest + React Testing Library, run with `npm test`.

- `model.test.ts`: `toRequest` for each question type, `auto` omits `model`, `fromQuestionsJson` round-trip and rejection cases, validation rules.
- `ResultPanel.test.tsx`: renders choice/score/noul answers, confidence badge bands, raw JSON toggle.
- `storage.test.ts`: draft save/load, version mismatch ignored, history cap of 20.
- `App.test.tsx`: happy path with mocked `fetch` — load preset, run, answer appears, history gains one entry; 422 shows detail.

`npm run lint` (ESLint, the Vite React template config) and `npm run build` must pass.

## Out of scope

`/predict` and `/predict/batch`, entering the API key in the browser, multi-user or server-side storage, streaming, batch runs.
