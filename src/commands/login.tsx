import { useState, useEffect } from "react";
import { Box, Text, useApp } from "ink";
import { arena } from "../api/client";
import type { User } from "../api/types";
import { Spinner } from "../components/Spinner";
import { useCommand } from "../hooks/use-command";
import { config } from "../lib/config";
import { performOAuthFlow } from "../lib/oauth";

interface Props {
  token?: string;
}

function LoginToken({ token }: { token: string }) {
  const { data, error, loading } = useCommand(async () => {
    config.setToken(token);
    try {
      return await arena.getMe();
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
        <Text dimColor>  Check that your token is valid</Text>
      </Box>
    );
  }

  if (!data) return null;

  return <LoginSuccess user={data} />;
}

type OAuthStep = "opening" | "waiting" | "exchanging" | "done" | "error";

function LoginOAuth() {
  const { exit } = useApp();
  const [step, setStep] = useState<OAuthStep>("opening");
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    performOAuthFlow(config.getClientId(), {
      onBrowserOpen: () => {
        if (!cancelled) setStep("waiting");
      },
      onCodeReceived: () => {
        if (!cancelled) setStep("exchanging");
      },
    })
      .then(async (token) => {
        if (cancelled) return;
        config.setToken(token);
        const me = await arena.getMe();
        if (cancelled) return;
        setUser(me);
        setStep("done");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setStep("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (step === "done" || step === "error") {
      if (step === "error") process.exitCode = 1;
      exit();
    }
  }, [step, exit]);

  switch (step) {
    case "opening":
      return <Spinner label="Opening browser" />;
    case "waiting":
      return <Spinner label="Waiting for authorization" />;
    case "exchanging":
      return <Spinner label="Logging in" />;
    case "error":
      return (
        <Box flexDirection="column">
          <Text color="red">✕ {error}</Text>
        </Box>
      );
    case "done":
      return user ? <LoginSuccess user={user} /> : null;
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
      <Text dimColor>  Token saved to {config.getConfigPath()}</Text>
    </Box>
  );
}

export function LoginCommand({ token }: Props) {
  if (token) return <LoginToken token={token} />;
  return <LoginOAuth />;
}
