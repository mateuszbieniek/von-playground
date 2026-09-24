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
