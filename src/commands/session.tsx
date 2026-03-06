import React, { useState, useEffect, useRef } from "react";
import { Box, Text, useApp, useInput } from "ink";
import useSWR from "swr";
import { arena, ArenaError } from "../api/client";
import type { Block, Channel, User } from "../api/types";
import { BlockItem } from "../components/BlockItem";
import { Spinner } from "../components/Spinner";
import { truncate } from "../lib/format";
import { indicators } from "../lib/theme";
import { parsePositiveInt } from "../lib/args";
import { config } from "../lib/config";
import { openUrl } from "../lib/open";
import { InteractiveChannel, BlockViewer } from "./channel";
import { ARG_HINTS, COMMANDS, type SessionCommand } from "./session/constants";
import { useSessionAuth } from "./session/use-session-auth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type View =
  | { kind: "home" }
  | { kind: "channel"; slug: string }
  | { kind: "block"; blockIds: number[]; index: number }
  | { kind: "search"; query: string }
  | { kind: "channels" };

// ---------------------------------------------------------------------------
// Session root
// ---------------------------------------------------------------------------

export function SessionMode() {
  const { exit } = useApp();
  const auth = useSessionAuth();
  const [stack, setStack] = useState<View[]>([{ kind: "home" }]);
  const stackRef = useRef(stack);
  stackRef.current = stack;
  const current = stack[stack.length - 1]!;

  useInput((input, key) => {
    if ((key.ctrl && input === "c") || input === "\u0003") {
      exit();
    }
  });

  useEffect(() => {
    if (auth.status === "login_error") {
      process.exitCode = 1;
      exit();
    }
  }, [auth, exit]);

  switch (auth.status) {
    case "checking":
      return <Spinner label="Checking authentication" />;
    case "login": {
      const labels = {
        opening: "Opening browser",
        waiting: "Waiting for authorization",
        exchanging: "Logging in",
      } as const;
      return <Spinner label={labels[auth.step]} />;
    }
    case "login_error":
      return <Text color="red">✕ {auth.message}</Text>;
    case "ready":
      break;
  }

  const me = auth.user;
  const push = (view: View) => setStack((s) => [...s, view]);
  const pop = () => {
    if (stackRef.current.length <= 1) return exit();
    setStack((s) => s.slice(0, -1));
  };

  switch (current.kind) {
    case "channel":
      return <InteractiveChannel slug={current.slug} per={24} onExit={pop} />;
    case "block":
      return (
        <BlockViewer
          blockIds={current.blockIds}
          index={current.index}
          onBack={pop}
          onNavigate={(newIndex) => {
            setStack((s) => [
              ...s.slice(0, -1),
              { kind: "block", blockIds: current.blockIds, index: newIndex },
            ]);
          }}
        />
      );
    case "search":
      return (
        <SearchResultsView
          query={current.query}
          onNavigate={push}
          onBack={pop}
        />
      );
    case "channels":
      return <ChannelsListView me={me} onNavigate={push} onBack={pop} />;
    default:
      return (
        <HomeScreen
          me={me}
          onNavigate={push}
          onLogout={() => {
            config.clearToken();
            exit();
          }}
          onExit={() => exit()}
        />
      );
  }
}

// ---------------------------------------------------------------------------
// Home — command prompt with tiered autocomplete
// ---------------------------------------------------------------------------

function HomeScreen({
  me,
  onNavigate,
  onLogout,
  onExit,
}: {
  me: User;
  onNavigate: (view: View) => void;
  onLogout: () => void;
  onExit: () => void;
}) {
  const [input, setInput] = useState("");
  const [cursor, setCursor] = useState(0);
  const [activeCommand, setActiveCommand] = useState<SessionCommand | null>(
    null,
  );
  const [inputError, setInputError] = useState<string | null>(null);

  const filtered = activeCommand
    ? []
    : COMMANDS.filter(
        (c) => !input || c.name.startsWith(input.toLowerCase().trim()),
      );

  useEffect(() => {
    if (cursor >= filtered.length && filtered.length > 0) {
      setCursor(filtered.length - 1);
    }
  }, [filtered.length, cursor]);

  function selectCommand(cmd: SessionCommand) {
    setInputError(null);
    if (cmd.args) {
      setActiveCommand(cmd);
      setInput("");
    } else {
      execute(cmd.name, "");
    }
  }

  function execute(name: string, arg: string) {
    const value = arg.trim();
    setInputError(null);

    switch (name) {
      case "channel":
        if (!value) return setInputError("Channel slug is required");
        return onNavigate({ kind: "channel", slug: value });
      case "search":
        if (!value) return setInputError("Search query is required");
        return onNavigate({ kind: "search", query: value });
      case "block":
        if (!value) return setInputError("Block ID is required");
        try {
          return onNavigate({
            kind: "block",
            blockIds: [parsePositiveInt(value, "block id")],
            index: 0,
          });
        } catch (err: unknown) {
          return setInputError(
            err instanceof Error ? err.message : "Invalid block ID",
          );
        }
      case "channels":
        return onNavigate({ kind: "channels" });
      case "logout":
        return onLogout();
      case "exit":
        return onExit();
    }
  }

  useInput((char, key) => {
    if (key.escape) {
      if (activeCommand) {
        setActiveCommand(null);
        setInput("");
      } else if (input) {
        setInput("");
        setCursor(0);
      } else {
        onExit();
      }
      return;
    }

    if (activeCommand) {
      if (key.return && input.trim())
        return execute(activeCommand.name, input.trim());
      if (key.backspace || key.delete) {
        if (input.length === 0) setActiveCommand(null);
        else setInput((i) => i.slice(0, -1));
        setInputError(null);
        return;
      }
      if (key.tab) return;
      if (char && !key.ctrl && !key.meta) {
        setInput((i) => i + char);
        setInputError(null);
      }
      return;
    }

    if (key.upArrow) return setCursor((c) => Math.max(0, c - 1));
    if (key.downArrow)
      return setCursor((c) => Math.min(filtered.length - 1, c + 1));
    if ((key.tab || key.return) && filtered[cursor])
      return selectCommand(filtered[cursor]!);
    if (key.backspace || key.delete) {
      setInput((i) => i.slice(0, -1));
      setCursor(0);
      setInputError(null);
      return;
    }
    if (char && !key.ctrl && !key.meta && !key.tab) {
      setInput((i) => i + char);
      setCursor(0);
      setInputError(null);
    }
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="green">
          **
        </Text>
        <Text bold> arena</Text>
        <Text dimColor> · {me.name}</Text>
      </Box>

      <Box>
        <Text color="green">{"> "}</Text>
        {activeCommand && <Text>{activeCommand.name} </Text>}
        <Text>{input}</Text>
        <Text dimColor>█</Text>
      </Box>

      {!activeCommand && filtered.length > 0 && (
        <Box flexDirection="column" marginLeft={2}>
          {filtered.map((cmd, i) => {
            const argsLen = cmd.args ? cmd.args.length + 1 : 0;
            const pad = " ".repeat(Math.max(2, 20 - cmd.name.length - argsLen));
            return (
              <Box key={cmd.name}>
                <Text color={i === cursor ? "cyan" : undefined}>
                  {i === cursor ? "▸ " : "  "}
                </Text>
                <Text bold={i === cursor}>{cmd.name}</Text>
                {cmd.args && <Text dimColor> {cmd.args}</Text>}
                <Text dimColor>
                  {pad}
                  {cmd.desc}
                </Text>
              </Box>
            );
          })}
        </Box>
      )}

      {activeCommand?.args && (
        <Box marginLeft={2}>
          <Text dimColor>{ARG_HINTS[activeCommand.args] ?? "enter value"}</Text>
        </Box>
      )}

      {inputError && (
        <Box marginLeft={2}>
          <Text color="red">✕ {inputError}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>
          {activeCommand
            ? "↵ submit · esc back"
            : "tab complete · ↑↓ navigate · esc quit · ctrl+c exit"}
        </Text>
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Search results
// ---------------------------------------------------------------------------

function SearchResultsView({
  query,
  onNavigate,
  onBack,
}: {
  query: string;
  onNavigate: (view: View) => void;
  onBack: () => void;
}) {
  const PER = 20;
  const [page, setPage] = useState(1);
  const [cursor, setCursor] = useState(0);

  const {
    data,
    error,
    isLoading: loading,
  } = useSWR(`search/${query}?page=${page}&per=${PER}`, () =>
    arena.search(query, { page, per: PER }).then((r) => {
      const channels = r.data.filter((i): i is Channel => i.type === "Channel");
      const blocks = r.data.filter(
        (i): i is Block => i.type !== "Channel" && i.type !== "User",
      );
      return {
        channels,
        blocks,
        items: [...channels, ...blocks],
        meta: r.meta,
      };
    }),
  );

  const items = data?.items ?? [];
  const channels = data?.channels ?? [];
  const blocks = data?.blocks ?? [];

  useEffect(() => {
    if (cursor >= items.length && items.length > 0) {
      setCursor(items.length - 1);
    }
  }, [items.length, cursor]);

  useInput((char, key) => {
    if (char === "q" || key.escape) return onBack();
    if (loading) return;

    switch (true) {
      case key.upArrow || char === "k":
        setCursor((c) => Math.max(0, c - 1));
        break;
      case key.downArrow || char === "j":
        setCursor((c) => Math.min(items.length - 1, c + 1));
        break;
      case key.return && !!items[cursor]: {
        const item = items[cursor]!;
        if (item.type === "Channel") {
          onNavigate({ kind: "channel", slug: (item as Channel).slug });
        } else {
          const blockIds = blocks.map((b) => b.id);
          onNavigate({
            kind: "block",
            blockIds,
            index: blockIds.indexOf(item.id),
          });
        }
        break;
      }
      case (key.rightArrow || char === "n") &&
        !!data &&
        page < data.meta.total_pages:
        setPage((p) => p + 1);
        setCursor(0);
        break;
      case (key.leftArrow || char === "p") && page > 1:
        setPage((p) => p - 1);
        setCursor(0);
        break;
      case char === "o" && !!items[cursor]: {
        const item = items[cursor]!;
        if (item.type === "Channel") {
          const ch = item as Channel;
          openUrl(`https://www.are.na/${ch.owner?.slug || ""}/${ch.slug}`);
        } else {
          openUrl(`https://www.are.na/block/${item.id}`);
        }
        break;
      }
    }
  });

  if (loading) return <Spinner label={`Searching "${query}"`} />;

  if (error) {
    const isPermission = error instanceof ArenaError && error.status === 403;
    const message = isPermission
      ? "Search requires Are.na Premium"
      : error.message;
    return (
      <Box flexDirection="column">
        <Text color="red">✕ {message}</Text>
        <Box marginTop={1}>
          <Text dimColor>q back</Text>
        </Box>
      </Box>
    );
  }

  if (items.length === 0) {
    return (
      <Box flexDirection="column">
        <Text dimColor>No results for "{query}"</Text>
        <Box marginTop={1}>
          <Text dimColor>q back</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="green">
          **
        </Text>
        <Text bold> arena</Text>
        <Text dimColor> · search · </Text>
        <Text>{query}</Text>
      </Box>

      <Box flexDirection="column">
        {channels.length > 0 && (
          <>
            <Text dimColor> Channels</Text>
            {channels.map((ch, i) => (
              <Box key={ch.slug}>
                <Text color={i === cursor ? "cyan" : undefined}>
                  {i === cursor ? "▸ " : "  "}
                </Text>
                <Text color="green" bold={i === cursor}>
                  {indicators.Channel} {truncate(ch.title, 50)}
                </Text>
                <Text dimColor>
                  {" "}
                  · {ch.visibility} · {ch.counts.contents}
                </Text>
              </Box>
            ))}
          </>
        )}

        {blocks.length > 0 && (
          <>
            {channels.length > 0 && <Text> </Text>}
            <Text dimColor> Blocks</Text>
            {blocks.map((block, i) => {
              const idx = channels.length + i;
              return (
                <BlockItem
                  key={block.id}
                  item={block}
                  selected={idx === cursor}
                />
              );
            })}
          </>
        )}
      </Box>

      {data && (
        <Box marginTop={1}>
          <Text dimColor>
            Page {page}/{data.meta.total_pages} · ↑↓ navigate · ↵ open · ←→ page
            · o browser · q back
          </Text>
        </Box>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Channels list
// ---------------------------------------------------------------------------

function ChannelsListView({
  me,
  onNavigate,
  onBack,
}: {
  me: User;
  onNavigate: (view: View) => void;
  onBack: () => void;
}) {
  const PER = 24;
  const [page, setPage] = useState(1);
  const [cursor, setCursor] = useState(0);

  const {
    data,
    error,
    isLoading: loading,
  } = useSWR(`user/${me.slug}/channels?page=${page}&per=${PER}`, () =>
    arena.getUserChannels(me.slug, { page, per: PER }),
  );

  const channels = data?.data ?? [];
  const meta = data?.meta;

  useEffect(() => {
    if (cursor >= channels.length && channels.length > 0) {
      setCursor(channels.length - 1);
    }
  }, [channels.length, cursor]);

  useInput((char, key) => {
    if (char === "q" || key.escape) return onBack();
    if (loading) return;

    switch (true) {
      case key.upArrow || char === "k":
        setCursor((c) => Math.max(0, c - 1));
        break;
      case key.downArrow || char === "j":
        setCursor((c) => Math.min(channels.length - 1, c + 1));
        break;
      case key.return && !!channels[cursor]:
        onNavigate({ kind: "channel", slug: channels[cursor]!.slug });
        break;
      case (key.rightArrow || char === "n") &&
        !!meta &&
        page < meta.total_pages:
        setPage((p) => p + 1);
        setCursor(0);
        break;
      case (key.leftArrow || char === "p") && page > 1:
        setPage((p) => p - 1);
        setCursor(0);
        break;
      case char === "o" && !!channels[cursor]: {
        const ch = channels[cursor]!;
        openUrl(`https://www.are.na/${ch.owner?.slug || ""}/${ch.slug}`);
        break;
      }
    }
  });

  if (loading) return <Spinner label="Loading channels" />;

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">✕ {error.message}</Text>
        <Box marginTop={1}>
          <Text dimColor>q back</Text>
        </Box>
      </Box>
    );
  }

  if (channels.length === 0) {
    return (
      <Box flexDirection="column">
        <Text dimColor>No channels found</Text>
        <Box marginTop={1}>
          <Text dimColor>q back</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="green">
          **
        </Text>
        <Text bold> arena</Text>
        <Text dimColor> · channels · {me.name}</Text>
      </Box>

      <Box flexDirection="column">
        {channels.map((ch, i) => (
          <Box key={ch.slug}>
            <Text color={i === cursor ? "cyan" : undefined}>
              {i === cursor ? "▸ " : "  "}
            </Text>
            <Text color="green" bold={i === cursor}>
              {indicators.Channel} {truncate(ch.title, 50)}
            </Text>
            <Text dimColor>
              {" "}
              · {ch.visibility} · {ch.counts.contents}
            </Text>
          </Box>
        ))}
      </Box>

      {meta && (
        <Box marginTop={1}>
          <Text dimColor>
            Page {page}/{meta.total_pages} · ↑↓ navigate · ↵ open · ←→ page · o
            browser · q back
          </Text>
        </Box>
      )}
    </Box>
  );
}
