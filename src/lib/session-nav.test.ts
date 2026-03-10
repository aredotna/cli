import assert from "node:assert/strict";
import test from "node:test";
import {
  clampBlockIndex,
  orderedBlockIndexByCursor,
  wrapIndex,
} from "./session-nav";

test("wrapIndex wraps at boundaries", () => {
  assert.equal(wrapIndex(0, 5, -1), 4);
  assert.equal(wrapIndex(4, 5, 1), 0);
  assert.equal(wrapIndex(2, 5, 1), 3);
  assert.equal(wrapIndex(2, 5, -1), 1);
  assert.equal(wrapIndex(0, 0, 1), 0);
});

test("orderedBlockIndexByCursor maps ordered mixed list correctly", () => {
  const items = [
    { type: "Channel", id: 1 },
    { type: "Image", id: 2 },
    { type: "Channel", id: 3 },
    { type: "Text", id: 4 },
  ];

  assert.equal(orderedBlockIndexByCursor(items, 1), 0);
  assert.equal(orderedBlockIndexByCursor(items, 3), 1);
  assert.equal(orderedBlockIndexByCursor(items, -1), -1);
  assert.equal(orderedBlockIndexByCursor(items, 10), -1);
});

test("clampBlockIndex handles empty and out-of-range indices", () => {
  assert.equal(clampBlockIndex(0, 0), null);
  assert.equal(clampBlockIndex(-1, 3), 0);
  assert.equal(clampBlockIndex(99, 3), 2);
  assert.equal(clampBlockIndex(1, 3), 1);
});
