import { useReducer, useEffect } from "react";
import { Box, Text, useApp } from "ink";
import { client, getData } from "../api/client";
import type { User } from "../api/types";
import { Spinner } from "../components/Spinner";
import { useCommand } from "../hooks/use-command";
import { config } from "../lib/config";
import { performOAuthFlow } from "../lib/oauth";

export function LoginCommand({ token }: { token?: string }) {
  if (token) return <LoginToken token={token} />;
  return <LoginOAuth />;
}

function LoginToken({ token }: { token: string }) {
  const { data, error, loading } = useCommand(async () => {
    config.setToken(token);
    try {
      return await getData(client.GET("/v3/me"));
    } catch (err) {
      config.clearToken();
      throw err;
    }
  });

  if (loading) return <Spinner label="Authenticating" />;

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">✕ {error}</Text>
        <Text dimColor> Check that your token is valid</Text>
      </Box>
    );
  }

  if (!data) return null;

  return <LoginSuccess user={data} />;
}

type OAuthState =
  | { step: "opening" }
  | { step: "waiting" }
  | { step: "exchanging" }
  | { step: "done"; user: User }
  | { step: "error"; message: string };

function oauthReducer(_: OAuthState, action: OAuthState): OAuthState {
  return action;
}

function LoginOAuth() {
  const { exit } = useApp();
  const [state, dispatch] = useReducer(oauthReducer, { step: "opening" });

  useEffect(() => {
    let cancelled = false;

    performOAuthFlow(config.getClientId(), {
      onBrowserOpen: () => {
        if (!cancelled) dispatch({ step: "waiting" });
      },
      onCodeReceived: () => {
        if (!cancelled) dispatch({ step: "exchanging" });
      },
    })
      .then(async (token) => {
        if (cancelled) return;
        config.setToken(token);
        const user = await getData(client.GET("/v3/me"));
        if (!cancelled) dispatch({ step: "done", user });
      })
      .catch((err: unknown) => {
        if (!cancelled)
          dispatch({
            step: "error",
            message: err instanceof Error ? err.message : String(err),
          });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (state.step === "done" || state.step === "error") {
      if (state.step === "error") process.exitCode = 1;
      exit();
    }
  }, [state, exit]);

  switch (state.step) {
    case "opening":
      return <Spinner label="Opening browser" />;
    case "waiting":
      return <Spinner label="Waiting for authorization" />;
    case "exchanging":
      return <Spinner label="Logging in" />;
    case "error":
      return <Text color="red">✕ {state.message}</Text>;
    case "done":
      return <LoginSuccess user={state.user} />;
  }
}

function LoginSuccess({ user }: { user: User }) {
  return (
    <Box flexDirection="column">
      <Box>
        <Text color="green">✓ </Text>
        <Text>Authenticated as </Text>
        <Text bold>{user.name}</Text>
        <Text dimColor> @{user.slug}</Text>
      </Box>
      <Text dimColor> Token saved to {config.getConfigPath()}</Text>
    </Box>
  );
}
