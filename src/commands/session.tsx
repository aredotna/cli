import React, { useState, useEffect, useCallback, useRef } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { arena, ArenaError } from "../api/client";
import type { Block, Channel, User } from "../api/types";
import { BlockItem } from "../components/BlockItem";
import { Spinner } from "../components/Spinner";
import { truncate } from "../lib/format";
import { indicators } from "../lib/theme";
import { config } from "../lib/config";
import { performOAuthFlow } from "../lib/oauth";
import { openUrl } from "../lib/open";
import { InteractiveChannel, BlockViewer } from "./channel";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type View =
  | { kind: "home" }
  | { kind: "channel"; slug: string }
  | { kind: "block"; blockIds: number[]; index: number }
  | { kind: "search"; query: string }
  | { kind: "channels" };

interface Command {
  name: string;
  args: string | null;
  desc: string;
}

const COMMANDS: Command[] = [
  { name: "channel", args: "<slug>", desc: "Browse a channel" },
  { name: "search", args: "<query>", desc: "Search Are.na" },
  { name: "block", args: "<id>", desc: "View a block" },
  { name: "channels", args: null, desc: "Your channels" },
  { name: "logout", args: null, desc: "Log out of your account" },
];

// ---------------------------------------------------------------------------
// Session root
// ---------------------------------------------------------------------------

type AuthState =
  | { status: "checking" }
  | { status: "login"; step: "opening" | "waiting" | "exchanging" }
  | { status: "login_error"; message: string }
  | { status: "ready"; user: User };

export function SessionMode() {
  const { exit } = useApp();
  const [auth, setAuth] = useState<AuthState>({ status: "checking" });
  const [stack, setStack] = useState<View[]>([{ kind: "home" }]);
  const stackRef = useRef(stack);
  stackRef.current = stack;
  const current = stack[stack.length - 1]!;

  useEffect(() => {
    let cancelled = false;

    arena
      .getMe()
      .then((user) => {
        if (!cancelled) setAuth({ status: "ready", user });
      })
      .catch(() => {
        if (cancelled) return;
        setAuth({ status: "login", step: "opening" });

        performOAuthFlow(config.getClientId(), {
          onBrowserOpen: () => {
            if (!cancelled) setAuth({ status: "login", step: "waiting" });
          },
          onCodeReceived: () => {
            if (!cancelled) setAuth({ status: "login", step: "exchanging" });
          },
        })
          .then(async (token) => {
            if (cancelled) return;
            config.setToken(token);
            const user = await arena.getMe();
            if (!cancelled) setAuth({ status: "ready", user });
          })
          .catch((err: unknown) => {
            if (!cancelled)
              setAuth({
                status: "login_error",
                message: err instanceof Error ? err.message : String(err),
              });
          });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (auth.status === "login_error") {
      process.exitCode = 1;
      exit();
    }
  }, [auth, exit]);

  if (auth.status === "checking") {
    return <Spinner label="Checking authentication" />;
  }

  if (auth.status === "login") {
    const labels = {
      opening: "Opening browser",
      waiting: "Waiting for authorization",
      exchanging: "Logging in",
    };
    return <Spinner label={labels[auth.step]} />;
  }

  if (auth.status === "login_error") {
    return <Text color="red">✕ {auth.message}</Text>;
  }

  const me = auth.user;

  const push = (view: View) => setStack((s) => [...s, view]);

  const pop = () => {
    if (stackRef.current.length <= 1) exit();
    else setStack((s) => s.slice(0, -1));
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

interface HomeProps {
  me: User | null;
  onNavigate: (view: View) => void;
  onLogout: () => void;
  onExit: () => void;
}

function HomeScreen({ me, onNavigate, onLogout, onExit }: HomeProps) {
  const [input, setInput] = useState("");
  const [cursor, setCursor] = useState(0);
  const [activeCommand, setActiveCommand] = useState<Command | null>(null);

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

  function selectCommand(cmd: Command) {
    if (cmd.args) {
      setActiveCommand(cmd);
      setInput("");
    } else {
      execute(cmd.name, "");
    }
  }

  function execute(name: string, arg: string) {
    switch (name) {
      case "channel":
        onNavigate({ kind: "channel", slug: arg });
        break;
      case "search":
        onNavigate({ kind: "search", query: arg });
        break;
      case "block":
        onNavigate({ kind: "block", blockIds: [Number(arg)], index: 0 });
        break;
      case "channels":
        onNavigate({ kind: "channels" });
        break;
      case "logout":
        config.clearToken();
        onLogout();
        break;
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
      if (key.return && input.trim()) {
        execute(activeCommand.name, input.trim());
        return;
      }
      if (key.backspace || key.delete) {
        if (input.length === 0) {
          setActiveCommand(null);
        } else {
          setInput((i) => i.slice(0, -1));
        }
        return;
      }
      if (key.tab) return;
      if (char && !key.ctrl && !key.meta) {
        setInput((i) => i + char);
      }
      return;
    }

    if (key.upArrow) {
      setCursor((c) => Math.max(0, c - 1));
      return;
    }
    if (key.downArrow) {
      setCursor((c) => Math.min(filtered.length - 1, c + 1));
      return;
    }
    if ((key.tab || key.return) && filtered[cursor]) {
      selectCommand(filtered[cursor]!);
      return;
    }
    if (key.backspace || key.delete) {
      setInput((i) => i.slice(0, -1));
      setCursor(0);
      return;
    }
    if (char && !key.ctrl && !key.meta && !key.tab) {
      setInput((i) => i + char);
      setCursor(0);
    }
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="green">
          **
        </Text>
        <Text bold> arena</Text>
        {me && <Text dimColor> · {me.name}</Text>}
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

      {activeCommand && (
        <Box marginLeft={2}>
          <Text dimColor>
            {activeCommand.args === "<slug>" && "enter channel slug"}
            {activeCommand.args === "<query>" && "enter search query"}
            {activeCommand.args === "<id>" && "enter block ID"}
          </Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>
          {activeCommand
            ? "↵ submit · esc back"
            : "tab complete · ↑↓ navigate · esc quit"}
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
  const [results, setResults] = useState<(Channel | Block)[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(null);
    arena
      .search(query, { page, per: PER })
      .then((r) => {
        const channels = r.data.filter(
          (i): i is Channel => i.type === "Channel",
        );
        const blocks = r.data.filter(
          (i): i is Block => i.type !== "Channel" && i.type !== "User",
        );
        setResults([...channels, ...blocks]);
        setTotalPages(r.meta.total_pages);
        setCursor(0);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof ArenaError && err.status === 403) {
          setError("Search requires Are.na Premium");
        } else {
          setError(err instanceof Error ? err.message : String(err));
        }
        setLoading(false);
      });
  }, [query, page]);

  useEffect(() => {
    if (cursor >= results.length && results.length > 0) {
      setCursor(results.length - 1);
    }
  }, [results.length, cursor]);

  const channels = results.filter((i): i is Channel => i.type === "Channel");
  const blocks = results.filter((i): i is Block => i.type !== "Channel");

  useInput((char, key) => {
    if (char === "q" || key.escape) {
      onBack();
      return;
    }
    if (loading) return;

    if (key.upArrow || char === "k") {
      setCursor((c) => Math.max(0, c - 1));
    } else if (key.downArrow || char === "j") {
      setCursor((c) => Math.min(results.length - 1, c + 1));
    } else if (key.return && results[cursor]) {
      const item = results[cursor]!;
      if (item.type === "Channel") {
        onNavigate({ kind: "channel", slug: (item as Channel).slug });
      } else {
        const blockIds = blocks.map((b) => b.id);
        const idx = blockIds.indexOf(item.id);
        onNavigate({ kind: "block", blockIds, index: idx });
      }
    } else if (key.rightArrow || char === "n") {
      if (page < totalPages) setPage((p) => p + 1);
    } else if (key.leftArrow || char === "p") {
      if (page > 1) setPage((p) => p - 1);
    } else if (char === "o" && results[cursor]) {
      const item = results[cursor]!;
      if (item.type === "Channel") {
        const ch = item as Channel;
        openUrl(`https://www.are.na/${ch.owner?.slug || ""}/${ch.slug}`);
      } else {
        openUrl(`https://www.are.na/block/${item.id}`);
      }
    }
  });

  if (loading) return <Spinner label={`Searching "${query}"`} />;

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">✕ {error}</Text>
        <Box marginTop={1}>
          <Text dimColor>q back</Text>
        </Box>
      </Box>
    );
  }

  if (results.length === 0) {
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
            {channels.map((ch, i) => {
              const selected = i === cursor;
              return (
                <Box key={ch.slug}>
                  <Text color={selected ? "cyan" : undefined}>
                    {selected ? "▸ " : "  "}
                  </Text>
                  <Text color="green" bold={selected}>
                    {indicators.Channel} {truncate(ch.title, 50)}
                  </Text>
                  <Text dimColor>
                    {" "}
                    · {ch.visibility} · {ch.counts.contents}
                  </Text>
                </Box>
              );
            })}
          </>
        )}

        {blocks.length > 0 && (
          <>
            {channels.length > 0 && <Text> </Text>}
            <Text dimColor> Blocks</Text>
            {blocks.map((block, i) => {
              const idx = channels.length + i;
              const selected = idx === cursor;
              return (
                <BlockItem key={block.id} item={block} selected={selected} />
              );
            })}
          </>
        )}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          Page {page}/{totalPages} · ↑↓ navigate · ↵ open · ←→ page · o browser
          · q back
        </Text>
      </Box>
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
  me: User | null;
  onNavigate: (view: View) => void;
  onBack: () => void;
}) {
  const PER = 24;
  const [channels, setChannels] = useState<Channel[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    if (!me) {
      setError("Not logged in. Run `arena login` first.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    arena
      .getUserChannels(me.slug, { page, per: PER })
      .then((r) => {
        setChannels(r.data);
        setTotalPages(r.meta.total_pages);
        setCursor(0);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
  }, [me, page]);

  useEffect(() => {
    if (cursor >= channels.length && channels.length > 0) {
      setCursor(channels.length - 1);
    }
  }, [channels.length, cursor]);

  useInput((char, key) => {
    if (char === "q" || key.escape) {
      onBack();
      return;
    }
    if (loading) return;

    if (key.upArrow || char === "k") {
      setCursor((c) => Math.max(0, c - 1));
    } else if (key.downArrow || char === "j") {
      setCursor((c) => Math.min(channels.length - 1, c + 1));
    } else if (key.return && channels[cursor]) {
      onNavigate({ kind: "channel", slug: channels[cursor]!.slug });
    } else if (key.rightArrow || char === "n") {
      if (page < totalPages) setPage((p) => p + 1);
    } else if (key.leftArrow || char === "p") {
      if (page > 1) setPage((p) => p - 1);
    } else if (char === "o" && channels[cursor]) {
      const ch = channels[cursor]!;
      openUrl(`https://www.are.na/${ch.owner?.slug || ""}/${ch.slug}`);
    }
  });

  if (loading) return <Spinner label="Loading channels" />;

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">✕ {error}</Text>
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
        <Text dimColor> · channels</Text>
        {me && <Text dimColor> · {me.name}</Text>}
      </Box>

      <Box flexDirection="column">
        {channels.map((ch, i) => {
          const selected = i === cursor;
          return (
            <Box key={ch.slug}>
              <Text color={selected ? "cyan" : undefined}>
                {selected ? "▸ " : "  "}
              </Text>
              <Text color="green" bold={selected}>
                {indicators.Channel} {truncate(ch.title, 50)}
              </Text>
              <Text dimColor>
                {" "}
                · {ch.visibility} · {ch.counts.contents}
              </Text>
            </Box>
          );
        })}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          Page {page}/{totalPages} · ↑↓ navigate · ↵ open · ←→ page · o browser
          · q back
        </Text>
      </Box>
    </Box>
  );
}
