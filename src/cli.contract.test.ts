import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

function runCli(args: string[]) {
  return spawnSync(
    process.execPath,
    ["--import", "tsx", "src/cli.tsx", ...args],
    {
      cwd: projectRoot,
      encoding: "utf8",
      env: process.env,
    },
  );
}

test("json unknown command returns typed error and non-zero exit", () => {
  const result = runCli(["--json", "pign"]);
  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout || result.stderr) as {
    type: string;
    hint?: string;
  };
  assert.equal(payload.type, "unknown_command");
  assert.ok(payload.hint?.includes("arena ping"));
});

test("json unknown subcommand returns typed error and non-zero exit", () => {
  const result = runCli(["--json", "channel", "contnts", "slug"]);
  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout || result.stderr) as {
    type: string;
    hint?: string;
  };
  assert.equal(payload.type, "unknown_subcommand");
  assert.ok(payload.hint?.includes("arena channel contents"));
});

test("json unsupported command returns json_not_supported type", () => {
  const result = runCli(["--json", "login"]);
  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout || result.stderr) as {
    type: string;
  };
  assert.equal(payload.type, "json_not_supported");
});

test("plain unknown command fails non-interactive with stderr error", () => {
  const result = runCli(["pign"]);
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes("Unknown command: pign"));
});

test("--quiet keeps schema while compacting JSON", () => {
  const quiet = runCli(["--json", "--quiet", "version"]);
  const pretty = runCli(["--json", "version"]);

  assert.equal(quiet.status, 0);
  assert.equal(pretty.status, 0);

  const quietPayload = JSON.parse(quiet.stdout) as Record<string, unknown>;
  const prettyPayload = JSON.parse(pretty.stdout) as Record<string, unknown>;

  assert.deepEqual(quietPayload, prettyPayload);
  assert.ok(!quiet.stdout.includes("\n  "), "expected compact JSON output");
  assert.ok(pretty.stdout.includes("\n  "), "expected pretty JSON output");
});
