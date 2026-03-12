import { Box, Text } from "ink";
import { useMemo, useState } from "react";
import type { User } from "../api/types";
import {
  getAvailableSessionCommands,
  type CommandSpecContext,
} from "../commands/session/command-specs";
import { usePagedCursorList } from "../hooks/usePagedCursorList";
import { useSessionListNavigation } from "../hooks/useSessionListNavigation";
import { accentColor, mutedColor } from "../lib/theme";
import type { SessionView } from "../commands/session/session-view";
import { useSessionPaletteActive } from "./SessionPaletteContext";
import { Panel, ScreenFrame } from "./ScreenChrome";

export function HomeScreen({
  me,
  onNavigate,
  onLogout,
  onExit,
  onOpenPalette,
}: {
  me: User;
  onNavigate: (view: SessionView) => void;
  onLogout: () => void;
  onExit: () => void;
  onOpenPalette: (seed?: string) => void;
}) {
  const paletteActive = useSessionPaletteActive();
  const [error, setError] = useState<string | null>(null);
  const listState = usePagedCursorList({});
  const actions = useMemo(
    () => getAvailableSessionCommands({ kind: "home" }),
    [],
  );
  const commandContext = useMemo<CommandSpecContext>(
    () => ({
      me,
      view: { kind: "home" },
      navigate: onNavigate,
      back: () => {},
      logout: onLogout,
      exit: onExit,
      openBrowser: () => {},
    }),
    [me, onExit, onLogout, onNavigate],
  );

  const list = useSessionListNavigation({
    state: {
      page: listState.page,
      cursor: listState.cursor,
    },
    handlers: listState,
    itemCount: actions.length,
    paletteActive,
    canNextPage: () => false,
    onBack: () => {},
    onOpen: (index) => {
      const action = actions[index];
      if (!action) return;
      if (action.args) {
        onOpenPalette(`${action.name} `);
        return;
      }
      try {
        action.run(commandContext, "");
        setError(null);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
  });

  return (
    <ScreenFrame title="Home">
      <Panel title="Action items">
        <Box flexDirection="column">
          {actions.map((action, index) => (
            <Box key={action.name}>
              <Text color={list.state.cursor === index ? "cyan" : undefined}>
                {list.state.cursor === index ? "▸ " : "  "}
              </Text>
              <Text color={accentColor()} bold={list.state.cursor === index}>
                /{action.name}
              </Text>
              {action.args ? (
                <Text color={mutedColor()}> {action.args}</Text>
              ) : null}
              <Text color={mutedColor()}> · {action.desc}</Text>
            </Box>
          ))}
          {error ? <Text color="red">✕ {error}</Text> : null}
        </Box>
      </Panel>
    </ScreenFrame>
  );
}
