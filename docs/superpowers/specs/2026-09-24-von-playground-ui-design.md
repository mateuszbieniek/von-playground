# Von Playground UI — Design

Date: 2026-09-24
Supersedes: `2026-09-24-playground-ui-design.md` (Laya version).

## Goal

A single static web page, served by an nginx container next to Von, that lets a user write a `state`, define a set of `questions`, send them to Von's `POST /v1/systemone`, and read the answers visually. Local playground for one developer; no auth proxy, no build step.

## Constraints and facts about Von (verified from `von-sdk` 1.2.2 source)

- CORS is built in. Default `VON_CORS_ORIGINS=*`, so the browser calls `http://localhost:8000` directly. Credentials are only enabled when an explicit allowlist is set.
- `VON_API_KEY`, when set, requires `Authorization: Bearer <key>` on `/v1/systemone`. Wrong or missing key returns 401.
- Request: `{ model?: string, state: any, questions: { [name]: Question } }`. `questions` must be non-empty. `state` may be a string, object, or array.
- Question shapes:
  - `choice`: `{ type, instructions, criteria: { [key]: string | null } }`
  - `score`: `{ type, instructions, criteria: string[] }` (2 to 10 levels; objects also accepted upstream but the form only emits strings)
  - `noul`: `{ type, instructions, criteria?: { true: string, false: string } }`
  - `instructions` may be a string, object, or array; Von stringifies non-strings.
- Answer shapes, every answer carries `type`:
  - `choice`: `{ type, choice, probabilities: { [key]: number }, confidence }`
  - `score`: `{ type, score, confidence, legend: { "0": "...", ... }, probabilities: { "0": number, ... } }`
  - `noul`: `{ type, noul }` (no confidence)
- Envelope: `{ model: "von-1.2.0", answers, usage: { input_tokens, output_tokens } }`. There is no `routing` field.
- Every engine failure, including weights not yet downloaded, is HTTP 422 with a `detail` string. Validation errors are also 422.
- `GET /health` is liveness only; it returns `ok` before weights load. Readiness means a real `/v1/systemone` request succeeded.

## Architecture

```
browser ── :3000 ──> playground (nginx:alpine, ./ui bind-mounted read-only)
        ── :8000 ──> von (CORS *)
```

- `ui/index.html`, `ui/app.js`, `ui/style.css`. Vanilla ES2020 JavaScript, `fetch`, no framework, no bundler, no npm.
- `docker-compose.yml` gains service `playground`:
  - `image: nginx:alpine`
  - `volumes: ["./ui:/usr/share/nginx/html:ro"]`
  - `ports: ["${PLAYGROUND_BIND_ADDRESS:-127.0.0.1}:${PLAYGROUND_PORT:-3000}:80"]`
  - `restart: unless-stopped`
  - No `depends_on`. The page has its own health indicator; blocking static file serving on a 10-minute weight download buys nothing.
  - No custom nginx config.
- API base URL: default `http://localhost:8000`. Overridable by `?api=<url>` query parameter and by an input in the toolbar. The chosen value is saved in `localStorage` under `von-playground.api`. This is needed because `VON_PORT` is configurable and the browser is outside the Docker network.
- API key: optional toolbar input, held in memory only, never persisted. When non-empty it is sent as `Authorization: Bearer <key>`.
- `CLAUDE.md` gains the new service, URL, and env vars.

## Data model (`app.js`)

```js
draft = {
  state: "",                       // textarea text
  questions: [                     // ordered
    { id, name, type: "choice", instructions, criteria: [{ key, description }] },
    { id, name, type: "score",  instructions, levels: ["..."] },
    { id, name, type: "noul",   instructions, trueText: "", falseText: "" },
  ],
}
```

The draft lives in memory only. Reloading the page resets it. Nothing is persisted except the API base URL.

### `buildRequest(draft)`

Returns `{ model: "von-latest", state, questions }`.

- `state`: if the trimmed textarea text parses as a JSON object or array, send the parsed value. Otherwise send the trimmed string.
- `choice`: `criteria` is an object mapping key to description, or `null` when the description is empty.
- `score`: `criteria` is the array of level strings in order.
- `noul`: `criteria: { true: trueText, false: falseText }` only when either text is non-empty; otherwise the key is omitted.

### `validate(draft)`

Returns a list of error strings. Empty list means valid. Rules:

- `state` non-empty after trim.
- At least one question.
- Question names non-empty and unique.
- Every `instructions` non-empty.
- `choice`: at least 2 criteria, keys non-empty and unique within the question.
- `score`: 2 to 10 levels, each non-empty.
- `noul`: no extra rule.

Errors are listed under the Run button; Run is disabled while any exist.

### Raw mode

A tab next to the form shows one textarea holding the full request body as JSON.

- Switching form to raw fills the textarea from `buildRequest(draft)` pretty-printed.
- Switching raw to form calls `parseRequest(json)`, which rebuilds a draft from the JSON. Unknown `type`, missing `criteria` on choice or score, or non-object `questions` is an error. On error the UI shows the message and stays in raw mode.
- `parseRequest` maps `state` back to text: strings as-is, objects and arrays pretty-printed.
- Running in raw mode sends the textarea content after a `JSON.parse` check. Parse failure shows the error and does not send.

## Response rendering

Answer kind is detected from `answer.type`, not from the draft.

- `choice`: winning key in bold, one horizontal bar per option sorted by probability descending, percentage label on each. Confidence badge.
- `score`: headline `score` to 2 decimals, with the range `0` to `levels - 1` shown next to it. One bar per level ordered by numeric key, label from `legend`, argmax highlighted. Confidence badge.
- `noul`: a single bar for p(true) with percentage. No badge.
- Confidence badge bands: 0.8 and above green, 0.5 and above amber, below red.
- Run footer: `model` from the response, `input_tokens`, `output_tokens`, wall time in ms measured with `performance.now()` around the `fetch`.
- "Raw JSON" toggle showing the pretty-printed response with a copy button.
- "Copy as curl" button on the request; output matches the shape of the smoke-test curl in `CLAUDE.md`, including the `Authorization` header when a key is set.

## Presets

Three, bundled in `app.js`, one per type: "Ticket triage" (choice), "Review sentiment" (score, 5 levels), "Churn risk" (noul with true/false criteria). Loading a preset replaces the draft. If the current draft is non-empty, an inline confirm bar ("Replace current draft? Yes / No") appears first; no `window.confirm`.

## Health and errors

Toolbar dot polls `GET {api}/health` every 10 seconds.

| Dot | Meaning |
|---|---|
| grey | not checked yet |
| red | `/health` unreachable |
| amber | `/health` ok, no successful inference yet |
| green | a `/v1/systemone` request has succeeded |

On page load, one probe request `{ state: "probe", questions: { p: { type: "noul", instructions: "probe" } } }` is sent to reach green early. A 422 on the probe (weights still loading) leaves the dot amber and puts the `detail` in the dot's tooltip. The probe is not repeated; a normal successful run also turns the dot green.

| Condition | Shown under Run |
|---|---|
| 422 | the `detail` string |
| 401 | "API key required or wrong. Set it in the toolbar." |
| network error or 5xx | "Von unreachable at {api}" |
| raw JSON invalid | the parse error; request not sent |

## Layout

Single page, toolbar on top, three columns on wide screens (`state`, `questions`, `results`), stacked on narrow screens. Toolbar: health dot, API URL input, API key input, Presets menu, Reset, Run. `Ctrl+Enter` or `Cmd+Enter` runs. Run shows a spinner and elapsed time while pending.

## Testing

No test framework and no build. Verification is:

- `ui/model.js` (pure helpers) is unit-tested with Node's built-in runner: `node --test ui/model.test.js`. No dependencies.
- `node --check ui/app.js` passes.
- Each preset runs against the live container and its answer type renders correctly.
- Copied curl pastes into a shell and returns the same answer.
- 422 path: in raw mode, a question with an unknown `type` (for example `"magic"`) shows Von's `detail`. Note: Von accepts a one-level score, so that is not a 422 trigger.
- 401 path: with `VON_API_KEY` set on the container, an empty or wrong key shows the 401 message and the right key succeeds.
- Raw mode round-trip: form to raw to form preserves the draft; invalid JSON is rejected without changing the form.
- Final check driven in the browser with screenshots.

## Out of scope

History, draft persistence, model selection, hiding the API key from the browser, multi-user use, exposing the playground beyond loopback, batch runs.
