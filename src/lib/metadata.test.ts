import test from "node:test";
import assert from "node:assert/strict";
import { metadataInputFlag, parseMetadata } from "./metadata";

test("parseMetadata parses key=value scalars", () => {
  assert.deepEqual(parseMetadata("status=reviewed,score=0.95,featured=true"), {
    status: "reviewed",
    score: 0.95,
    featured: true,
  });
});

test("parseMetadata parses JSON object values", () => {
  assert.deepEqual(
    parseMetadata('{"status":"reviewed","score":1,"featured":false}'),
    {
      status: "reviewed",
      score: 1,
      featured: false,
    },
  );
});

test("metadataInputFlag allows null values for merge removal", () => {
  assert.deepEqual(metadataInputFlag({ metadata: "status=null" }), {
    status: null,
  });
});

test("parseMetadata rejects nested values", () => {
  assert.throws(
    () => parseMetadata('{"tags":["nested"]}'),
    /Invalid metadata value/,
  );
});

test("parseMetadata rejects invalid keys", () => {
  assert.throws(() => parseMetadata("bad-key=value"), /Invalid metadata key/);
});

test("parseMetadata preserves strings that don't round-trip as numbers", () => {
  assert.deepEqual(parseMetadata("sku=00123,zip=05401,decimal=1.10"), {
    sku: "00123",
    zip: "05401",
    decimal: "1.10",
  });
});

test("parseMetadata supports backslash-escaped commas in values", () => {
  assert.deepEqual(parseMetadata("note=hello\\, world,status=ok"), {
    note: "hello, world",
    status: "ok",
  });
});
