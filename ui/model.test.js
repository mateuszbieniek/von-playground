import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newQuestion, emptyDraft, isDraftEmpty, parseState, stateToText,
  buildQuestion, buildRequest, validate, parseRequest, formatDetail, toCurl, PRESETS, cloneDraft,
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

test("cloneDraft: mutations do not reach the source (presets stay pristine)", () => {
  const src = PRESETS[0].draft;
  const c = cloneDraft(src);
  c.questions[0].criteria[0].key = "MUTATED";
  c.questions[0].criteria.push({ key: "z", description: "" });
  c.state = "changed";
  assert.notEqual(src.questions[0].criteria[0].key, "MUTATED");
  assert.equal(src.questions[0].criteria.length, 3);
  assert.notEqual(src.state, "changed");
  assert.notEqual(c.questions[0], src.questions[0]);
});

test("PRESETS: four, each valid, first three one per type", () => {
  assert.deepEqual(PRESETS.map((p) => p.name), ["Ticket triage", "Review sentiment", "Churn risk", "Article tags"]);
  assert.deepEqual(PRESETS.slice(0, 3).map((p) => p.draft.questions[0].type), ["choice", "score", "noul"]);
  for (const p of PRESETS) assert.deepEqual(validate(p.draft), [], p.name);
  assert.equal(PRESETS[1].draft.questions[0].levels.length, 5);
});

test("PRESETS: Article tags is multi-label, one criteria-free noul per tag with unique names", () => {
  const qs = PRESETS[3].draft.questions;
  assert.ok(qs.length >= 4);
  assert.ok(qs.every((q) => q.type === "noul"));
  assert.ok(qs.every((q) => !q.trueText && !q.falseText));
  assert.equal(new Set(qs.map((q) => q.name)).size, qs.length);
  assert.equal(new Set(qs.map((q) => q.id)).size, qs.length);
});
