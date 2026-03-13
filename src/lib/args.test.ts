import test from "node:test";
import assert from "node:assert/strict";
import {
  idArg,
  parseArgs,
  parsePositiveInt,
  per,
  page,
  requireArg,
} from "./args";

test("parseArgs handles long, short, and -- separator", () => {
  const parsed = parseArgs([
    "block",
    "123",
    "--json",
    "--page=2",
    "-h",
    "--",
    "--not-a-flag",
  ]);

  assert.deepEqual(parsed.args, ["block", "123", "--not-a-flag"]);
  assert.equal(parsed.flags.json, true);
  assert.equal(parsed.flags.page, "2");
  assert.equal(parsed.flags.h, true);
});

test("parseArgs keeps command tokens after boolean globals", () => {
  const helpFirst = parseArgs(["--help", "channel"]);
  assert.deepEqual(helpFirst.args, ["channel"]);
  assert.equal(helpFirst.flags.help, true);

  const jsonFirst = parseArgs(["--json", "ping"]);
  assert.deepEqual(jsonFirst.args, ["ping"]);
  assert.equal(jsonFirst.flags.json, true);

  const mixedOrder = parseArgs(["channel", "--help"]);
  assert.deepEqual(mixedOrder.args, ["channel"]);
  assert.equal(mixedOrder.flags.help, true);
});

test("parseArgs preserves value semantics for value flags", () => {
  const parsed = parseArgs([
    "channel",
    "contents",
    "worldmaking",
    "--sort",
    "updated_at_desc",
    "--page",
    "2",
  ]);

  assert.deepEqual(parsed.args, ["channel", "contents", "worldmaking"]);
  assert.equal(parsed.flags.sort, "updated_at_desc");
  assert.equal(parsed.flags.page, "2");
});

test("requireArg enforces required values", () => {
  assert.equal(requireArg(["abc"], 0, "slug"), "abc");
  assert.throws(
    () => requireArg([], 0, "slug"),
    /Missing required argument: slug/,
  );
});

test("parsePositiveInt validates numeric values", () => {
  assert.equal(parsePositiveInt("12", "id"), 12);
  assert.throws(
    () => parsePositiveInt("0", "id"),
    /Expected a positive integer/,
  );
  assert.throws(
    () => parsePositiveInt("abc", "id"),
    /Expected a positive integer/,
  );
});

test("idArg parses positive integer IDs", () => {
  assert.equal(idArg(["42"], 0, "block id"), 42);
  assert.throws(
    () => idArg(["-1"], 0, "block id"),
    /Expected a positive integer/,
  );
});

test("page/per parse flags and reject invalid values", () => {
  assert.equal(page({}), 1);
  assert.equal(per({}), 24);
  assert.equal(page({ page: "3" }), 3);
  assert.equal(per({ per: "10" }), 10);
  assert.throws(() => page({ page: "0" }), /Expected a positive integer/);
  assert.throws(() => per({ per: true }), /--per requires a value/);
});
