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
