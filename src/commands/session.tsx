import { useEffect } from "react";
import { Text, useApp, useInput } from "ink";
import { ChannelsList } from "../components/ChannelsList";
import { Spinner } from "../components/Spinner";
import { HomeScreen } from "../components/HomeScreen";
import { SearchResults } from "../components/SearchResults";
import { config } from "../lib/config";
import { useStackNavigator } from "../hooks/useStackNavigator";
import { clearTerminalViewport } from "../lib/terminalViewport";
import { BlockViewer } from "../components/BlockViewer";
import { InteractiveChannel } from "./channel";
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
  const { current, push, pop, replace } = useStackNavigator<View>(
    { kind: "home" },
    { onPopRoot: exit, beforeTransition: clearTerminalViewport },
  );

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

  switch (current.kind) {
    case "channel":
      return (
        <InteractiveChannel
          key={`channel:${current.slug}`}
          slug={current.slug}
          per={24}
          onExit={pop}
        />
      );
    case "block":
      return (
        <BlockViewer
          key={`block:${current.index}:${current.blockIds.length}`}
          blockIds={current.blockIds}
          index={current.index}
          onBack={pop}
          onNavigate={(newIndex) => {
            replace({
              kind: "block",
              blockIds: current.blockIds,
              index: newIndex,
            });
          }}
        />
      );
    case "search":
      return (
        <SearchResults query={current.query} onNavigate={push} onBack={pop} />
      );
    case "channels":
      return <ChannelsList me={me} onNavigate={push} onBack={pop} />;
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
