import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Box, useApp, useInput } from "ink";
import { SessionFooter } from "../components/SessionFooter";
import {
  SessionFooterProvider,
  type SessionFooterAction,
} from "../components/SessionFooterContext";
import { SessionPalette } from "../components/SessionPalette";
import { SessionPaletteProvider } from "../components/SessionPaletteContext";
import {
  SessionHeader,
  SessionShellHeaderProvider,
} from "../components/ScreenChrome";
import { ScreenError, ScreenLoading } from "../components/ScreenStates";
import { config } from "../lib/config";
import { useStackNavigator } from "../hooks/useStackNavigator";
import { clearTerminalViewport } from "../lib/terminalViewport";
import { useSessionAuth } from "./session/use-session-auth";
import { openUrl } from "../lib/open";
import {
  isSameView,
  normalizeView,
  type SessionView as View,
} from "./session/session-view";
import {
  buildSessionBreadcrumbTitle,
  buildSessionBrowserUrl,
  getSessionFooterActions,
  renderSessionView,
  type SessionViewContext,
} from "./session/session-view-config";

export function SessionMode() {
  const { exit } = useApp();
  const auth = useSessionAuth();
  const [paletteActive, setPaletteActive] = useState(false);
  const [paletteOpenRequest, setPaletteOpenRequest] = useState<{
    id: number;
    seed: string;
  } | null>(null);
  const [headerOverride, setHeaderOverride] = useState<ReactNode | null>(null);
  const [runtimeFooterActions, setRuntimeFooterActions] = useState<
    SessionFooterAction[]
  >([]);

  const setHeaderOverrideSafe = useCallback((next: ReactNode | null) => {
    setHeaderOverride((current) => (Object.is(current, next) ? current : next));
  }, []);

  const registerFooterActions = useCallback(
    (nextActions: SessionFooterAction[]) => {
      setRuntimeFooterActions((currentActions) => {
        if (currentActions.length === nextActions.length) {
          const unchanged = currentActions.every(
            (action, index) =>
              action.key === nextActions[index]?.key &&
              action.label === nextActions[index]?.label,
          );
          if (unchanged) return currentActions;
        }
        return nextActions;
      });
    },
    [],
  );

  const { current, push, pop, replace, reset } = useStackNavigator<View>(
    { kind: "home" },
    { onPopRoot: exit, beforeTransition: clearTerminalViewport },
  );

  useInput((input, key) => {
    if ((key.ctrl && input === "c") || input === "\u0003") {
      exit();
      return;
    }

    if (auth.status === "login_error") {
      if (input === "q" || key.escape || key.return) {
        exit();
      }
    }
  });

  useEffect(() => {
    if (auth.status === "login_error") {
      process.exitCode = 1;
    }
  }, [auth.status]);

  const normalizedCurrent = normalizeView(current);
  const openPalette = useCallback((seed = "") => {
    setPaletteOpenRequest((current) => ({
      id: (current?.id ?? 0) + 1,
      seed,
    }));
  }, []);
  const logout = useCallback(() => {
    config.clearToken();
    exit();
  }, [exit]);

  useEffect(() => {
    if (!isSameView(current, normalizedCurrent)) {
      replace(normalizedCurrent);
    }
  }, [current, normalizedCurrent, replace]);

  switch (auth.status) {
    case "checking":
      return <ScreenLoading label="Checking authentication" />;
    case "login": {
      const labels = {
        opening: "Opening browser",
        waiting: "Waiting for authorization",
        exchanging: "Logging in",
      } as const;
      return <ScreenLoading label={labels[auth.step]} />;
    }
    case "login_error":
      return <ScreenError title="Authorization error" message={auth.message} />;
    case "ready":
      break;
  }

  const me = auth.user;
  const view = normalizedCurrent;

  const viewContext: SessionViewContext = {
    me,
    push,
    pop,
    replace,
    reset,
    logout,
    exit,
    openPalette,
  };

  const defaultFooterActions = getSessionFooterActions(view, me);
  const defaultHeaderTitle = buildSessionBreadcrumbTitle(view, me);
  const headerTitle = headerOverride ?? defaultHeaderTitle;

  const content = renderSessionView(view, viewContext);

  function openBrowserForView(currentView: View) {
    const url = buildSessionBrowserUrl(currentView, me);
    if (url) openUrl(url);
  }

  const paletteActions: SessionFooterAction[] = [
    { key: "↑↓", label: "select" },
    { key: "↵", label: "run" },
    { key: "tab", label: "complete" },
    { key: "esc", label: view.kind === "home" ? "clear" : "close" },
  ];

  const footerActions = paletteActive
    ? paletteActions
    : runtimeFooterActions.length > 0
      ? runtimeFooterActions
      : defaultFooterActions;

  return (
    <SessionPaletteProvider active={paletteActive}>
      <SessionFooterProvider setActions={registerFooterActions}>
        <SessionShellHeaderProvider setHeaderOverride={setHeaderOverrideSafe}>
          <Box flexDirection="column">
            <SessionHeader title={headerTitle} />
            <Box flexDirection="column" marginBottom={1}>
              {content}
            </Box>
            <SessionFooter actions={footerActions} />
            <SessionPalette
              me={me}
              view={view}
              onNavigate={(nextView) => {
                if (nextView.kind === "home") {
                  reset({ kind: "home" });
                  return;
                }
                push(nextView);
              }}
              onBack={pop}
              onLogout={() => {
                logout();
              }}
              onExit={exit}
              onOpenBrowser={() => openBrowserForView(view)}
              onActiveChange={setPaletteActive}
              openRequest={paletteOpenRequest}
            />
          </Box>
        </SessionShellHeaderProvider>
      </SessionFooterProvider>
    </SessionPaletteProvider>
  );
}
