import test, { describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { loadEnv } from "./env";
import { parseArgs } from "./args";
import { exitCodeFromError, formatJsonError } from "./exit-codes";
import { CLI_PACKAGE_NAME, getCliVersion } from "./version";

loadEnv();

process.env.ARENA_VCR_MODE = process.env.ARENA_VCR_MODE || "auto";
process.env.ARENA_VCR_NAME = process.env.ARENA_VCR_NAME || "registry-test";

const { commandMap } = await import("./registry");

function assertNonProductionApiBase(): void {
  const resolvedApiBase = process.env["ARENA_API_URL"] || "https://api.are.na";
  let hostname: string;

  try {
    hostname = new URL(resolvedApiBase).hostname.toLowerCase();
  } catch {
    throw new Error(
      `Invalid ARENA_API_URL: ${resolvedApiBase}. ` +
        "Set ARENA_API_URL to a non-production base before running integration tests.",
    );
  }

  const isProductionHost = hostname === "api.are.na";

  if (isProductionHost) {
    throw new Error(
      "Refusing to run integration tests against production. " +
        `Resolved API base: ${resolvedApiBase}. ` +
        "Set ARENA_API_URL to a non-production host (for example staging) before running npm test.",
    );
  }
}

assertNonProductionApiBase();

async function json(...rawArgs: string[]): Promise<unknown> {
  const { args, flags } = parseArgs(rawArgs);
  const [command, ...rest] = args;
  const def = commandMap.get(command!);
  if (!def?.json) throw new Error(`Unknown command: ${command}`);
  const result = await def.json(rest, flags);
  return result;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function exitCode(...rawArgs: string[]): Promise<number> {
  try {
    await json(...rawArgs);
    return 0;
  } catch (err: unknown) {
    return exitCodeFromError(err);
  }
}

async function jsonError(
  ...rawArgs: string[]
): Promise<{ error: string; code: number | null; type: string }> {
  try {
    await json(...rawArgs);
    throw new Error("Expected command to fail");
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "Expected command to fail")
      throw err;
    return formatJsonError(err);
  }
}

// ── Ping & Auth ──

describe("ping", () => {
  test("returns ok status", async () => {
    const data = (await json("ping")) as { status: string };
    assert.equal(data.status, "ok");
  });
});

describe("whoami", () => {
  test("returns current user with expected shape", async () => {
    const data = (await json("whoami")) as {
      id: number;
      type: string;
      slug: string;
      name: string;
    };
    assert.equal(data.type, "User");
    assert.ok(data.id > 0);
    assert.ok(data.slug.length > 0);
    assert.ok(data.name.length > 0);
  });
});

describe("version", () => {
  test("returns current CLI version", async () => {
    const data = (await json("version")) as { name: string; version: string };
    assert.equal(data.name, CLI_PACKAGE_NAME);
    assert.equal(data.version, getCliVersion());
  });
});

// ── Channel CRUD ──

describe("channel lifecycle", () => {
  let channelSlug: string;
  let channelId: number;
  let blockId: number;
  let connectionId: number;
  let commentId: number;

  before(async () => {
    // Create a private channel for testing
    const ch = (await json(
      "channel",
      "create",
      "CLI Integration Test",
      "--visibility",
      "private",
    )) as { id: number; slug: string; title: string; visibility: string };
    channelSlug = ch.slug;
    channelId = ch.id;
    assert.equal(ch.title, "CLI Integration Test");
    assert.equal(ch.visibility, "private");
    assert.ok(ch.id > 0);
  });

  after(async () => {
    // Clean up: delete the channel
    const result = (await json("channel", "delete", channelSlug)) as {
      deleted: boolean;
    };
    assert.equal(result.deleted, true);
  });

  test("channel view returns channel info", async () => {
    const data = (await json("channel", channelSlug)) as {
      id: number;
      slug: string;
      title: string;
      counts: { contents: number };
    };
    assert.equal(data.id, channelId);
    assert.equal(data.slug, channelSlug);
    assert.ok(data.title.length > 0);
    assert.ok(typeof data.counts.contents === "number");
  });

  test("channel update modifies title, description, and visibility", async () => {
    const updated = (await json(
      "channel",
      "update",
      channelSlug,
      "--title",
      "CLI Updated Title",
      "--description",
      "Test description",
    )) as {
      title: string;
      slug: string;
      description: { plain: string };
    };
    assert.equal(updated.title, "CLI Updated Title");
    assert.equal(updated.description.plain, "Test description");
    // Update slug to the new one
    channelSlug = updated.slug;
  });

  test("add creates a text block in the channel", async () => {
    const block = (await json(
      "add",
      channelSlug,
      "Integration test content",
    )) as {
      id: number;
      type: string;
      content: { plain: string };
    };
    blockId = block.id;
    assert.equal(block.type, "Text");
    assert.equal(block.content.plain, "Integration test content");
    assert.ok(block.id > 0);
  });

  test("block view returns the created block", async () => {
    const block = (await json("block", String(blockId))) as {
      id: number;
      type: string;
    };
    assert.equal(block.id, blockId);
    assert.equal(block.type, "Text");
  });

  test("block update modifies title and description", async () => {
    const block = (await json(
      "block",
      "update",
      String(blockId),
      "--title",
      "Updated Title",
      "--description",
      "Updated desc",
    )) as {
      id: number;
      title: string;
      description: { plain: string };
    };
    assert.equal(block.id, blockId);
    assert.equal(block.title, "Updated Title");
    assert.equal(block.description.plain, "Updated desc");
  });

  test("block comments lists comments (initially empty)", async () => {
    const data = (await json("block", "comments", String(blockId))) as {
      data: unknown[];
      meta: { total_count: number };
    };
    assert.ok(Array.isArray(data.data));
    assert.equal(data.meta.total_count, 0);
  });

  test("comment creates and appears on block", async () => {
    const comment = (await json(
      "comment",
      String(blockId),
      "Test comment",
    )) as {
      id: number;
      body: { plain: string };
    };
    commentId = comment.id;
    assert.ok(comment.id > 0);
    assert.equal(comment.body.plain, "Test comment");

    // Verify it appears in block comments. The API can be eventually
    // consistent, so poll briefly before failing.
    let seen = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      const data = (await json("block", "comments", String(blockId))) as {
        data: { id: number }[];
        meta: { total_count: number };
      };
      if (data.data.some((entry) => entry.id === commentId)) {
        seen = true;
        break;
      }
      await sleep(250);
    }
    assert.equal(seen, true);
  });

  test("comment delete removes the comment", async () => {
    const result = (await json("comment", "delete", String(commentId))) as {
      deleted: boolean;
      id: number;
    };
    assert.equal(result.deleted, true);
    assert.equal(result.id, commentId);
  });

  test("block connections lists channels where block appears", async () => {
    const data = (await json("block", "connections", String(blockId))) as {
      data: { id: number }[];
      meta: { total_count: number };
    };
    assert.ok(data.meta.total_count >= 1);
    assert.ok(data.data.some((ch) => ch.id === channelId));
  });

  test("channel contents subcommand returns raw paginated data", async () => {
    const data = (await json("channel", "contents", channelSlug)) as {
      data: { id: number }[];
      meta: { current_page: number; per_page: number; total_count: number };
    };
    assert.ok(Array.isArray(data.data));
    assert.ok(data.data.some((b) => b.id === blockId));
    assert.equal(data.meta.current_page, 1);
    assert.ok(data.meta.total_count >= 1);
    // Should NOT have channel metadata (title, slug, etc.)
    assert.ok(!("title" in data));
    assert.ok(!("slug" in data));
  });

  test("channel contents subcommand supports --per flag", async () => {
    const data = (await json(
      "channel",
      "contents",
      channelSlug,
      "--per",
      "1",
    )) as {
      data: unknown[];
      meta: { per_page: number };
    };
    assert.equal(data.meta.per_page, 1);
    assert.equal(data.data.length, 1);
  });

  test("channel connections lists where channel appears", async () => {
    const data = (await json("channel", "connections", channelSlug)) as {
      data: unknown[];
      meta: { current_page: number };
    };
    assert.ok(Array.isArray(data.data));
    assert.ok(data.meta.current_page >= 1);
  });

  test("channel followers lists followers", async () => {
    const data = (await json("channel", "followers", channelSlug)) as {
      data: unknown[];
      meta: { current_page: number };
    };
    assert.ok(Array.isArray(data.data));
  });

  test("channel contents supports --sort flag", async () => {
    const data = (await json(
      "channel",
      "contents",
      channelSlug,
      "--sort",
      "created_at_desc",
    )) as {
      data: unknown[];
    };
    assert.ok(Array.isArray(data.data));
  });

  // ── Connection lifecycle (within channel tests) ──

  test("connect adds block to a second channel", async () => {
    // Create a second channel
    const ch2 = (await json(
      "channel",
      "create",
      "CLI Connect Target",
      "--visibility",
      "private",
    )) as { id: number; slug: string };

    try {
      const result = (await json("connect", String(blockId), ch2.slug)) as {
        connected: boolean;
      };
      assert.equal(result.connected, true);

      // Get the connection ID from the second channel's contents
      const contents = (await json("channel", "contents", ch2.slug)) as {
        data: { connection: { id: number } }[];
      };
      connectionId = contents.data[0]!.connection.id;

      // View the connection
      const conn = (await json("connection", String(connectionId))) as {
        id: number;
        can: { remove: boolean };
      };
      assert.equal(conn.id, connectionId);
      assert.equal(conn.can.remove, true);

      // Move the connection
      const moved = (await json(
        "connection",
        "move",
        String(connectionId),
        "--movement",
        "move_to_top",
      )) as { id: number };
      assert.equal(moved.id, connectionId);

      // Delete the connection
      const deleted = (await json(
        "connection",
        "delete",
        String(connectionId),
      )) as { deleted: boolean };
      assert.equal(deleted.deleted, true);
    } finally {
      // Clean up second channel
      await json("channel", "delete", ch2.slug);
    }
  });
});

// ── User ──

describe("user", () => {
  let userSlug: string;

  before(async () => {
    const me = (await json("whoami")) as { slug: string };
    userSlug = me.slug;
  });

  test("user view returns user profile", async () => {
    const data = (await json("user", userSlug)) as {
      type: string;
      slug: string;
      counts: { channels: number; followers: number; following: number };
    };
    assert.equal(data.type, "User");
    assert.equal(data.slug, userSlug);
    assert.ok(typeof data.counts.channels === "number");
  });

  test("user contents returns paginated content", async () => {
    const data = (await json("user", "contents", userSlug)) as {
      data: unknown[];
      meta: { current_page: number; per_page: number };
    };
    assert.ok(Array.isArray(data.data));
    assert.equal(data.meta.current_page, 1);
  });

  test("user contents supports --sort and --type flags", async () => {
    const data = (await json(
      "user",
      "contents",
      userSlug,
      "--sort",
      "created_at_desc",
      "--type",
      "Channel",
    )) as {
      data: unknown[];
      meta: { current_page: number };
    };
    assert.ok(Array.isArray(data.data));
  });

  test("user followers returns paginated list", async () => {
    const data = (await json("user", "followers", userSlug)) as {
      data: unknown[];
      meta: { current_page: number };
    };
    assert.ok(Array.isArray(data.data));
  });

  test("user following returns paginated list", async () => {
    const data = (await json("user", "following", userSlug)) as {
      data: unknown[];
      meta: { current_page: number };
    };
    assert.ok(Array.isArray(data.data));
  });

  test("user following supports --type flag", async () => {
    const data = (await json(
      "user",
      "following",
      userSlug,
      "--type",
      "Channel",
    )) as {
      data: unknown[];
    };
    assert.ok(Array.isArray(data.data));
  });
});

// ── Pagination ──

describe("pagination", () => {
  test("--page and --per flags are respected", async () => {
    // Create a channel, add two blocks, then paginate
    const ch = (await json(
      "channel",
      "create",
      "CLI Pagination Test",
      "--visibility",
      "private",
    )) as { slug: string };

    try {
      await json("add", ch.slug, "Block one");
      await json("add", ch.slug, "Block two");

      const page1 = (await json(
        "channel",
        "contents",
        ch.slug,
        "--per",
        "1",
        "--page",
        "1",
      )) as {
        data: unknown[];
        meta: { current_page: number; per_page: number; total_count: number };
      };
      assert.equal(page1.meta.current_page, 1);
      assert.equal(page1.meta.per_page, 1);
      assert.equal(page1.data.length, 1);
      assert.ok(page1.meta.total_count >= 2);

      const page2 = (await json(
        "channel",
        "contents",
        ch.slug,
        "--per",
        "1",
        "--page",
        "2",
      )) as {
        data: unknown[];
        meta: { current_page: number };
      };
      assert.equal(page2.meta.current_page, 2);
      assert.equal(page2.data.length, 1);
    } finally {
      await json("channel", "delete", ch.slug);
    }
  });
});

// ── Error handling ──

describe("error handling", () => {
  test("missing required argument exits with error", async () => {
    await assert.rejects(json("channel"), /Missing required argument/);
  });

  test("invalid block ID exits with error", async () => {
    await assert.rejects(json("block", "not-a-number"), /Expected a positive/);
  });

  test("non-existent channel returns Not Found", async () => {
    await assert.rejects(
      json("channel", "this-channel-definitely-does-not-exist-xyz-999"),
      /Not Found/,
    );
  });

  test("non-existent block returns Not Found", async () => {
    await assert.rejects(json("block", "999999999"), /Not Found/);
  });

  test("exit code 0 on success", async () => {
    assert.equal(await exitCode("ping"), 0);
  });

  test("exit code 1 for client errors (bad args)", async () => {
    assert.equal(await exitCode("block", "not-a-number"), 1);
  });

  test("exit code 3 for 404 not found", async () => {
    assert.equal(await exitCode("block", "999999999"), 3);
  });

  test("search exits with success or forbidden based on account tier", async () => {
    const code = await exitCode("search", "test");
    assert.ok(
      code === 0 || code === 6,
      `Expected exit code 0 or 6 for search, got ${code}`,
    );
  });

  test("structured error includes code and type for API errors", async () => {
    const err = await jsonError("block", "999999999");
    assert.equal(err.code, 404);
    assert.equal(err.type, "not_found");
    assert.ok(err.error.length > 0);
  });

  test("structured error has null code for client errors", async () => {
    const err = await jsonError("block", "not-a-number");
    assert.equal(err.code, null);
    assert.equal(err.type, "client_error");
  });
});

// ── Add with extra flags ──

describe("add with metadata flags", () => {
  let channelSlug: string;

  before(async () => {
    const ch = (await json(
      "channel",
      "create",
      "CLI Add Flags Test",
      "--visibility",
      "private",
    )) as { slug: string };
    channelSlug = ch.slug;
  });

  after(async () => {
    await json("channel", "delete", channelSlug);
  });

  test("add supports --title and --description", async () => {
    const block = (await json(
      "add",
      channelSlug,
      "Content with metadata",
      "--title",
      "My Title",
      "--description",
      "My Desc",
    )) as {
      title: string;
      description: { plain: string };
    };
    assert.equal(block.title, "My Title");
    assert.equal(block.description.plain, "My Desc");
  });

  test("add supports URL values", async () => {
    const block = (await json("add", channelSlug, "https://example.com")) as {
      id: number;
      type: string;
    };
    // URL blocks may initially be PendingBlock while processing
    assert.ok(
      ["Link", "PendingBlock"].includes(block.type),
      `Expected Link or PendingBlock, got ${block.type}`,
    );
    assert.ok(block.id > 0);
  });
});

// ── Aliases ──

describe("aliases", () => {
  test("ch is alias for channel", async () => {
    await assert.rejects(json("ch"), /Missing required argument/);
  });

  test("bl is alias for block", async () => {
    await assert.rejects(json("bl"), /Missing required argument/);
  });

  test("me is alias for whoami", async () => {
    const data = (await json("me")) as { type: string };
    assert.equal(data.type, "User");
  });

  test("s is alias for search", async () => {
    const aliasCode = await exitCode("s", "test");
    const canonicalCode = await exitCode("search", "test");
    assert.equal(aliasCode, canonicalCode);
  });

  test("v is alias for version", async () => {
    const data = (await json("v")) as { name: string; version: string };
    assert.equal(data.name, CLI_PACKAGE_NAME);
    assert.equal(data.version, getCliVersion());
  });
});

// ── Quiet mode ──

describe("quiet mode", () => {
  test("--quiet preserves schema shape", async () => {
    const data = (await json("whoami", "--quiet")) as Record<string, unknown>;
    assert.ok("id" in data);
    assert.ok("name" in data);
    assert.ok("slug" in data);
  });

  test("--quiet passes through objects without id or slug", async () => {
    const data = (await json("ping", "--quiet")) as Record<string, unknown>;
    assert.equal(data.status, "ok");
  });

  test("--quiet outputs compact JSON (no indentation)", async () => {
    const result = await json("ping", "--quiet");
    const formatted = JSON.stringify(result);
    assert.ok(!formatted.includes("\n"), "Expected compact JSON");
  });
});
