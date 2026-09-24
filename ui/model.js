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
