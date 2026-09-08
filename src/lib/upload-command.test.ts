import test from "node:test";
import assert from "node:assert/strict";
import { client } from "../api/client";
import { commandMap } from "./registry";
import type { Flags } from "./args";

const invalidFlags: Array<{
  flags: Flags;
  error: RegExp;
}> = [
  { flags: { metadata: "oops" }, error: /Invalid metadata entry/ },
  {
    flags: { "connection-metadata": "oops" },
    error: /Invalid metadata entry/,
  },
  { flags: { "insert-at": "0" }, error: /Invalid insert-at/ },
  { flags: { metadata: true }, error: /--metadata requires a value/ },
  {
    flags: { "connection-metadata": true },
    error: /--connection-metadata requires a value/,
  },
  { flags: { "insert-at": true }, error: /--insert-at requires a value/ },
];

for (const { flags, error } of invalidFlags) {
  test(`upload rejects ${JSON.stringify(flags)} before network access`, async (t) => {
    const rejectNetwork = () => {
      throw new Error("Unexpected network access");
    };
    const get = t.mock.method(client, "GET", rejectNetwork);
    const post = t.mock.method(client, "POST", rejectNetwork);
    const fetch = t.mock.method(globalThis, "fetch", rejectNetwork);

    const upload = commandMap.get("upload")!;
    await assert.rejects(
      upload.json!(["unused-file.jpg"], { channel: "test", ...flags }),
      error,
    );
    assert.equal(get.mock.callCount(), 0);
    assert.equal(post.mock.callCount(), 0);
    assert.equal(fetch.mock.callCount(), 0);
  });
}
