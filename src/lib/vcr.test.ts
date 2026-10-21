import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

test("vcr replay requires request body to match", async () => {
  const root = await mkdtemp(join(tmpdir(), "arena-vcr-"));
  const cassetteName = "request-body";
  const vcrPath = fileURLToPath(new URL("./vcr.ts", import.meta.url));
  const projectRoot = resolve(dirname(vcrPath), "../..");

  try {
    await writeFile(
      join(root, `${cassetteName}.json`),
      JSON.stringify({
        entries: [
          {
            method: "POST",
            url: "https://api.test/v3/channels",
            requestBody: JSON.stringify({ title: "Recorded" }),
            status: 201,
            statusText: "Created",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: 1 }),
          },
        ],
      }),
    );

    const script = `
      import assert from "node:assert/strict";
      import { vcrFetch } from ${JSON.stringify(pathToFileURL(vcrPath).href)};

      await assert.rejects(
        vcrFetch("https://api.test/v3/channels", {
          method: "POST",
          body: JSON.stringify({}),
        }),
        /VCR replay miss/,
      );

      const response = await vcrFetch("https://api.test/v3/channels", {
        method: "POST",
        body: JSON.stringify({ title: "Recorded" }),
      });
      assert.equal(response.status, 201);
    `;

    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "--eval", script],
      {
        cwd: projectRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          ARENA_VCR_MODE: "replay",
          ARENA_VCR_DIR: root,
          ARENA_VCR_NAME: cassetteName,
        },
      },
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

for (const cassette of ["missing", "empty"]) {
  test(`strict replay never fetches with a ${cassette} cassette`, async (t) => {
    const root = await mkdtemp(join(tmpdir(), "arena-vcr-empty-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    if (cassette === "empty") {
      await writeFile(
        join(root, "empty.json"),
        JSON.stringify({ entries: [] }),
      );
    }
    const vcrUrl = new URL("./vcr.ts", import.meta.url);
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "--eval",
        `
        import assert from "node:assert/strict";
        import { vcrFetch } from ${JSON.stringify(vcrUrl.href)};
        let fetched = false;
        globalThis.fetch = async () => {
          fetched = true;
          return new Response("{}");
        };
        await assert.rejects(vcrFetch("https://api.test/v3/channels", {
          method: "POST", body: "{}",
        }), /VCR replay miss/);
        assert.equal(fetched, false);
      `,
      ],
      {
        cwd: resolve(dirname(fileURLToPath(vcrUrl)), "../.."),
        encoding: "utf8",
        env: {
          ...process.env,
          ARENA_VCR_MODE: "replay",
          ARENA_VCR_DIR: root,
          ARENA_VCR_NAME: cassette,
        },
      },
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
  });
}
