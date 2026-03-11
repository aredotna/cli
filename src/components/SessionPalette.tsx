import { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import type { User } from "../api/types";
import {
  SESSION_ARG_HINTS,
  SESSION_COMMAND_SPECS,
  type CommandSpec,
  type CommandSpecContext,
} from "../commands/session/command-specs";
import type { SessionView } from "../commands/session/session-view";
import {
  accentColor,
  brandColor,
  dockPromptBackgroundColor,
  dockTextColor,
  mutedColor,
} from "../lib/theme";

const NAMED_COLORS: Record<string, string> = {
  black: "#000000",
  white: "#ffffff",
  gray: "#808080",
  grey: "#808080",
};

function normalizeHex(color: string | undefined): string | null {
  if (!color) return null;
  if (color.startsWith("#")) {
    if (color.length === 7) return color.toLowerCase();
    if (color.length === 4) {
      const r = color[1];
      const g = color[2];
      const b = color[3];
      if (!r || !g || !b) return null;
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
  }
  return NAMED_COLORS[color.toLowerCase()] ?? null;
}

function blendHex(from: string, to: string, ratio: number): string {
  const clamped = Math.max(0, Math.min(1, ratio));
  const fromR = Number.parseInt(from.slice(1, 3), 16);
  const fromG = Number.parseInt(from.slice(3, 5), 16);
  const fromB = Number.parseInt(from.slice(5, 7), 16);
  const toR = Number.parseInt(to.slice(1, 3), 16);
  const toG = Number.parseInt(to.slice(3, 5), 16);
  const toB = Number.parseInt(to.slice(5, 7), 16);

  const r = Math.round(fromR + (toR - fromR) * clamped);
  const g = Math.round(fromG + (toG - fromG) * clamped);
  const b = Math.round(fromB + (toB - fromB) * clamped);

  return `#${r.toString(16).padStart(2, "0")}${g
    .toString(16)
    .padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function fitCommandNamesToWidth(
  names: string[],
  maxWidth: number,
  separatorWidth = 3,
): string[] {
  if (names.length === 0 || maxWidth <= 0) return [];

  const fitted: string[] = [];
  let used = 0;

  for (const name of names) {
    const nextWidth = (fitted.length > 0 ? separatorWidth : 0) + name.length;
    if (fitted.length > 0 && used + nextWidth > maxWidth) break;
    fitted.push(name);
    used += nextWidth;
  }

  return fitted;
}

function parseInput(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return { commandPart: "", argPart: "" };

  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex === -1) {
    return { commandPart: trimmed, argPart: "" };
  }

  return {
    commandPart: trimmed.slice(0, spaceIndex),
    argPart: trimmed.slice(spaceIndex + 1).trimStart(),
  };
}

export function SessionPalette({
  me,
  view,
  onNavigate,
  onBack,
  onLogout,
  onExit,
  onOpenBrowser,
  onActiveChange,
}: {
  me: User;
  view: SessionView;
  onNavigate: (view: SessionView) => void;
  onBack: () => void;
  onLogout: () => void;
  onExit: () => void;
  onOpenBrowser: () => void;
  onActiveChange: (active: boolean) => void;
}) {
  const [active, setActive] = useState(view.kind === "home");
  const [input, setInput] = useState("");
  const [cursor, setCursor] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const commandContext = useMemo<CommandSpecContext>(
    () => ({
      me,
      view,
      navigate: onNavigate,
      back: onBack,
      logout: onLogout,
      exit: onExit,
      openBrowser: onOpenBrowser,
    }),
    [me, onBack, onExit, onLogout, onNavigate, onOpenBrowser, view],
  );

  const availableCommands = useMemo(
    () =>
      SESSION_COMMAND_SPECS.filter((command) => command.when?.(view) ?? true),
    [view],
  );

  const { commandPart, argPart } = parseInput(input);

  const filtered = useMemo(() => {
    if (!commandPart) return availableCommands;

    const lowered = commandPart.toLowerCase();
    return availableCommands.filter((command) => {
      if (command.name.startsWith(lowered)) return true;
      if (command.name.includes(lowered)) return true;
      if (command.aliases?.some((alias) => alias.startsWith(lowered))) {
        return true;
      }
      return false;
    });
  }, [availableCommands, commandPart]);

  const selected = filtered[cursor] ?? filtered[0] ?? null;
  const startHex = normalizeHex(dockTextColor() ?? "white") ?? "#ffffff";
  const endHex = normalizeHex(dockPromptBackgroundColor()) ?? startHex;

  const inactivePreviewCommands = useMemo(() => {
    const names = availableCommands.map((command) => command.name);
    const columns = process.stdout.columns ?? 80;
    // Account for prompt caret, left/right padding, and breathing room.
    const maxWidth = Math.max(0, columns - 8);
    return fitCommandNamesToWidth(names, maxWidth);
  }, [availableCommands]);
  const activePreviewCommands = useMemo(() => {
    const names = filtered.map((command) => command.name);
    const columns = process.stdout.columns ?? 80;
    // Active suggestions use two-space separation and no padded container.
    const maxWidth = Math.max(0, columns - 2);
    return fitCommandNamesToWidth(names, maxWidth, 2);
  }, [filtered]);

  useEffect(() => {
    onActiveChange(active);
  }, [active, onActiveChange]);

  useEffect(() => {
    if (view.kind === "home") {
      setActive(true);
      return;
    }
    closePalette();
  }, [view.kind]);

  useEffect(() => {
    setCursor((value) => {
      if (filtered.length === 0) return 0;
      if (value >= filtered.length) return filtered.length - 1;
      return value;
    });
  }, [filtered.length]);

  function closePalette() {
    setActive(false);
    setInput("");
    setCursor(0);
    setError(null);
  }

  function openPalette(seed = "") {
    setActive(true);
    setInput(seed);
    setCursor(0);
    setError(null);
  }

  function applyCommand(command: CommandSpec, rawArg?: string) {
    try {
      const nextArg = rawArg ?? argPart;
      if (command.args && !nextArg.trim()) {
        setInput(`${command.name} `);
        setError(null);
        return;
      }
      command.run(commandContext, nextArg);
      closePalette();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useInput((char, key) => {
    if (!active) {
      if (char === "/") {
        openPalette("");
      }
      return;
    }

    if (key.escape) {
      closePalette();
      return;
    }

    if (key.upArrow) {
      setCursor((value) =>
        filtered.length === 0
          ? 0
          : (value - 1 + filtered.length) % filtered.length,
      );
      return;
    }

    if (key.downArrow) {
      setCursor((value) =>
        filtered.length === 0 ? 0 : (value + 1) % filtered.length,
      );
      return;
    }

    if (key.tab && selected) {
      setInput(selected.args ? `${selected.name} ` : selected.name);
      setError(null);
      return;
    }

    if (key.return) {
      if (selected) {
        applyCommand(selected);
      }
      return;
    }

    if (key.backspace || key.delete) {
      setInput((value) => value.slice(0, -1));
      setError(null);
      return;
    }

    if (char && !key.ctrl && !key.meta) {
      setInput((value) => value + char);
      setError(null);
    }
  });

  return (
    <Box flexDirection="column">
      <Box backgroundColor={dockPromptBackgroundColor()}>
        <Box paddingX={1} paddingY={1}>
          <Text color={brandColor()}>{active ? "›" : "/"}</Text>
          <Text color={dockTextColor()}> </Text>
          {active ? (
            <Text color={accentColor()}>{input || " "}</Text>
          ) : (
            <Text color={dockTextColor()}>
              {inactivePreviewCommands.map((name, index) => {
                const ratio =
                  inactivePreviewCommands.length <= 1
                    ? 0
                    : (index / (inactivePreviewCommands.length - 1)) * 0.95;

                return (
                  <Text key={name} color={blendHex(startHex, endHex, ratio)}>
                    {index > 0 ? " · " : ""}
                    {name}
                  </Text>
                );
              })}
            </Text>
          )}
          {active ? <Text color={mutedColor()}>█</Text> : null}
        </Box>
      </Box>

      {active && selected ? (
        <Box>
          <Text color={mutedColor()}>
            {selected.name}
            {selected.args ? ` ${selected.args}` : ""} · {selected.desc}
            {selected.args
              ? ` · ${SESSION_ARG_HINTS[selected.args] ?? "enter value"}`
              : ""}
          </Text>
        </Box>
      ) : null}

      {active && filtered.length > 0 ? (
        <Box>
          <Text color={mutedColor()}>
            {activePreviewCommands.map((name, index) => {
              const ratio =
                activePreviewCommands.length <= 1
                  ? 0
                  : (index / (activePreviewCommands.length - 1)) * 0.95;
              const isSelected = filtered[index] === selected;

              return (
                <Text key={name}>
                  {index > 0 ? "  " : ""}
                  <Text
                    color={
                      isSelected
                        ? accentColor()
                        : blendHex(startHex, endHex, ratio)
                    }
                    bold={isSelected}
                  >
                    {name}
                  </Text>
                </Text>
              );
            })}
          </Text>
        </Box>
      ) : null}

      {active && !selected ? (
        <Box>
          <Text color={mutedColor()}>No matching commands</Text>
        </Box>
      ) : null}
      {error ? (
        <Box>
          <Text color="red">✕ {error}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
