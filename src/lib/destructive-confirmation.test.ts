import test from "node:test";
import assert from "node:assert/strict";
import {
  destructiveActionForArgs,
  hasConfirmationBypass,
} from "./destructive-confirmation";

test("destructiveActionForArgs auto-detects delete subcommands", () => {
  assert.deepEqual(destructiveActionForArgs("channel", ["delete", "my-slug"]), {
    command: "channel",
    action: "delete",
    resourceLabel: "channel id",
    resourceId: "my-slug",
  });

  assert.deepEqual(destructiveActionForArgs("connection", ["delete", "42"]), {
    command: "connection",
    action: "delete",
    resourceLabel: "connection id",
    resourceId: "42",
  });
});

test("destructiveActionForArgs applies metadata for labels and arg index", () => {
  assert.deepEqual(
    destructiveActionForArgs("channel", ["delete", "my-slug"], {
      subcommands: { delete: { resourceLabel: "channel slug" } },
    }),
    {
      command: "channel",
      action: "delete",
      resourceLabel: "channel slug",
      resourceId: "my-slug",
    },
  );

  assert.deepEqual(
    destructiveActionForArgs("batch", ["cancel", "--id", "abc"], {
      subcommands: {
        cancel: { resourceArgIndex: 2, resourceLabel: "batch id" },
      },
    }),
    {
      command: "batch",
      action: "cancel",
      resourceLabel: "batch id",
      resourceId: "abc",
    },
  );
});

test("destructiveActionForArgs ignores non-destructive commands without metadata", () => {
  assert.equal(
    destructiveActionForArgs("channel", ["contents", "my-slug"]),
    undefined,
  );
  assert.equal(destructiveActionForArgs("logout", []), undefined);
  assert.equal(destructiveActionForArgs("comment", ["delete"]), undefined);
});

test("hasConfirmationBypass checks --yes and -y", () => {
  assert.equal(hasConfirmationBypass({ yes: true }), true);
  assert.equal(hasConfirmationBypass({ y: true }), true);
  assert.equal(hasConfirmationBypass({}), false);
});
