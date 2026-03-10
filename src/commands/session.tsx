import { useEffect } from "react";
import { Text, useApp, useInput } from "ink";
import { ChannelsList } from "../components/ChannelsList";
import { GroupContentsScreen } from "../components/GroupContentsScreen";
import { GroupProfileScreen } from "../components/GroupProfileScreen";
import { UserContentsScreen } from "../components/UserContentsScreen";
import { UserProfileScreen } from "../components/UserProfileScreen";
import { Spinner } from "../components/Spinner";
import { HomeScreen } from "../components/HomeScreen";
import { SearchResults } from "../components/SearchResults";
import { WhoamiScreen } from "../components/WhoamiScreen";
import { config } from "../lib/config";
import { useStackNavigator } from "../hooks/useStackNavigator";
import { clearTerminalViewport } from "../lib/terminalViewport";
import { clampBlockIndex } from "../lib/session-nav";
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
  | { kind: "channels" }
  | { kind: "userProfile"; slug: string }
  | { kind: "userContents"; slug: string }
  | { kind: "groupProfile"; slug: string }
  | { kind: "groupContents"; slug: string }
  | { kind: "whoami" };

function normalizeView(view: View): View {
  switch (view.kind) {
    case "block": {
      const index = clampBlockIndex(view.index, view.blockIds.length);
      if (index === null) return { kind: "home" };
      if (index === view.index) return view;
      return { ...view, index };
    }
    case "channel":
    case "userProfile":
    case "userContents":
    case "groupProfile":
    case "groupContents":
      if (!view.slug?.trim()) return { kind: "home" };
      return view;
    default:
      return view;
  }
}

function isSameView(a: View, b: View): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "block" && b.kind === "block") {
    if (a.index !== b.index) return false;
    if (a.blockIds.length !== b.blockIds.length) return false;
    return a.blockIds.every((id, i) => id === b.blockIds[i]);
  }
  if ("slug" in a && "slug" in b) return a.slug === b.slug;
  if ("query" in a && "query" in b) return a.query === b.query;
  return true;
}

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

  const normalizedCurrent = normalizeView(current);

  useEffect(() => {
    if (!isSameView(current, normalizedCurrent)) {
      replace(normalizedCurrent);
    }
  }, [current, normalizedCurrent, replace]);

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
  const view = normalizedCurrent;

  switch (view.kind) {
    case "channel":
      return (
        <InteractiveChannel
          key={`channel:${view.slug}`}
          slug={view.slug}
          per={24}
          onExit={pop}
        />
      );
    case "block":
      return (
        <BlockViewer
          key={`block:${view.index}:${view.blockIds.length}`}
          blockIds={view.blockIds}
          index={view.index}
          onBack={pop}
          onNavigate={(newIndex) => {
            replace({
              kind: "block",
              blockIds: view.blockIds,
              index: newIndex,
            });
          }}
        />
      );
    case "search":
      return (
        <SearchResults query={view.query} onNavigate={push} onBack={pop} />
      );
    case "channels":
      return <ChannelsList me={me} onNavigate={push} onBack={pop} />;
    case "userProfile":
      return (
        <UserProfileScreen
          slug={view.slug}
          onOpenContents={() => push({ kind: "userContents", slug: view.slug })}
          onBack={pop}
        />
      );
    case "userContents":
      return (
        <UserContentsScreen slug={view.slug} onNavigate={push} onBack={pop} />
      );
    case "groupProfile":
      return (
        <GroupProfileScreen
          slug={view.slug}
          onOpenContents={() =>
            push({ kind: "groupContents", slug: view.slug })
          }
          onBack={pop}
        />
      );
    case "groupContents":
      return (
        <GroupContentsScreen slug={view.slug} onNavigate={push} onBack={pop} />
      );
    case "whoami":
      return <WhoamiScreen me={me} onBack={pop} />;
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
