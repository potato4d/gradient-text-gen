import assert from "node:assert/strict";
import test from "node:test";
import { createOutline } from "./editorModel.js";

test("names newly added stroke layers as borders for the user interface", () => {
  assert.equal(createOutline(0).name, "Border 1");
  assert.equal(createOutline(11).name, "Border 12");
});
