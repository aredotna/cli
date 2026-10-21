import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commandMap } from "./registry";

process.env.ARENA_VCR_MODE = "off";

for (const role of ["viewer", "member", "admin"]) {
  for (const subcommand of ["create", "update", "member-role"]) {
    test(`group ${subcommand} sends the ${role} role`, async (t) => {
      const calls: Array<{ method: string; path: string; body: unknown }> = [];
      t.mock.method(
        globalThis,
        "fetch",
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const request = new Request(input, init);
          calls.push({
            method: request.method,
            path: new URL(request.url).pathname,
            body: await request.json(),
          });
          return Response.json({ id: 123, role });
        },
      );
      const args = [subcommand, "example"];
      const roleFlag = subcommand === "member-role" ? "role" : "default-role";
      if (subcommand === "member-role") args.push("123");
      const command = commandMap.get("group")!;
      await command.json!(args, { [roleFlag]: role });
      assert.deepEqual(calls, [
        {
          method:
            subcommand === "create"
              ? "POST"
              : subcommand === "update"
                ? "PUT"
                : "PATCH",
          path:
            subcommand === "create"
              ? "/v3/groups"
              : subcommand === "update"
                ? "/v3/groups/example"
                : "/v3/groups/example/members/123",
          body:
            subcommand === "create"
              ? { name: "example", default_role: role }
              : subcommand === "update"
                ? { default_role: role }
                : { role },
        },
      ]);
      const props = command.render(args, { [roleFlag]: role }).props;
      assert.equal(
        props[subcommand === "member-role" ? "role" : "defaultRole"],
        role,
      );
    });
  }
}

for (const value of [true, "", "owner"]) {
  test(`group rejects an invalid default role ${JSON.stringify(value)} before writing`, async (t) => {
    const fetch = t.mock.method(globalThis, "fetch", () => {
      throw new Error("Unexpected network access");
    });
    await assert.rejects(
      commandMap.get("group")!.json!(["create", "example"], {
        "default-role": value,
      }),
      /requires a value|Invalid --default-role/,
    );
    assert.equal(fetch.mock.callCount(), 0);
  });
}

for (const name of ["add", "upload", "batch"]) {
  test(`${name} sends cover_url in the block payload`, async (t) => {
    const root = await mkdtemp(join(tmpdir(), "arena-cover-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const file = join(root, "document.pdf");
    await writeFile(file, "mock upload");
    const writes: Array<{ path: string; body: Record<string, unknown> }> = [];
    t.mock.method(
      globalThis,
      "fetch",
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        const path = new URL(request.url).pathname;
        if (request.method === "GET") return Response.json({ id: 42 });
        if (path === "/v3/uploads/presign")
          return Response.json({
            files: [
              {
                upload_url: "https://upload.test/file",
                key: "document.pdf",
                content_type: "application/pdf",
              },
            ],
          });
        if (request.method === "PUT")
          return new Response(null, { status: 200 });
        writes.push({ path, body: await request.json() });
        return Response.json({ id: 1, batch_id: "batch" });
      },
    );
    const command = commandMap.get(name)!;
    const args =
      name === "upload" ? [file] : ["example", "https://example.com/page"];
    const flags = {
      channel: "example",
      "cover-url": "https://example.com/cover.jpg",
    };
    await command.json!(args, flags);
    assert.equal(writes.length, 1);
    assert.equal(
      writes[0]!.path,
      name === "batch" ? "/v3/blocks/batch" : "/v3/blocks",
    );
    const body = writes[0]!.body;
    const blocks = name === "batch" ? body.blocks : [body];
    assert.ok(Array.isArray(blocks));
    assert.equal(blocks[0].cover_url, flags["cover-url"]);
    if (name !== "batch")
      assert.equal(
        command.render(args, flags).props.coverUrl,
        flags["cover-url"],
      );
  });
}
