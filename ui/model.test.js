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
