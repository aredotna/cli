import { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import type { User } from "../api/types";
import { parsePositiveInt } from "../lib/args";
import {
  ARG_HINTS,
  COMMANDS,
  type SessionCommand,
} from "../commands/session/constants";

type HomeNavigateView =
  | { kind: "channel"; slug: string }
  | { kind: "block"; blockIds: number[]; index: number }
  | { kind: "search"; query: string }
  | { kind: "channels" };

export function HomeScreen({
  me,
  onNavigate,
  onLogout,
  onExit,
}: {
  me: User;
  onNavigate: (view: HomeNavigateView) => void;
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
        <Text bold> Are.na</Text>
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
