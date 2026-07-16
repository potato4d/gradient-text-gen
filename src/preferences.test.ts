import assert from "node:assert/strict";
import test from "node:test";
import { createInitialDocument, createReferenceFrame } from "./editorModel.js";
import {
  WORKSPACE_STORAGE_KEY,
  loadStoredWorkspace,
  parseStoredWorkspace,
  saveStoredWorkspace,
  type StorageLike,
  type StoredWorkspace,
} from "./preferences.js";

const createWorkspace = (): StoredWorkspace => ({
  version: 1,
  editor: createInitialDocument(),
  background: "dark",
  zoom: 120,
});

test("round-trips the last editor and preview settings", () => {
  const values = new Map<string, string>();
  const storage: StorageLike = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const workspace = createWorkspace();
  workspace.editor.text = "Saved artwork";

  assert.equal(saveStoredWorkspace(workspace, storage), true);
  assert.equal(values.has(WORKSPACE_STORAGE_KEY), true);
  assert.deepEqual(loadStoredWorkspace(storage), workspace);
});

test("rejects malformed or unsupported stored state", () => {
  assert.equal(parseStoredWorkspace(null), null);
  assert.equal(parseStoredWorkspace("not json"), null);
  assert.equal(parseStoredWorkspace('{"version":2}'), null);
  assert.equal(
    parseStoredWorkspace(
      JSON.stringify({ ...createWorkspace(), background: "paper", zoom: 500 }),
    ),
    null,
  );

  const outOfRange = createWorkspace();
  outOfRange.editor.typography.fontSize = 10000;
  assert.equal(parseStoredWorkspace(JSON.stringify(outOfRange)), null);
});

test("restores old fixed documents into the content-fitted web canvas", () => {
  const workspace = createWorkspace();
  workspace.editor.frame = createReferenceFrame();

  const restored = parseStoredWorkspace(JSON.stringify(workspace));

  assert.deepEqual(restored?.editor.frame, { mode: "fit" });
});

test("migrates previously generated outline names to border names", () => {
  const workspace = createWorkspace();
  workspace.editor.outlines[0]!.name = "Outline 1";

  const restored = parseStoredWorkspace(JSON.stringify(workspace));

  assert.equal(restored?.editor.outlines[0]?.name, "Border 1");
});

test("fails safely when browser storage is unavailable", () => {
  const blockedStorage: StorageLike = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };

  assert.equal(loadStoredWorkspace(blockedStorage), null);
  assert.equal(saveStoredWorkspace(createWorkspace(), blockedStorage), false);
});
