import { useEffect, useState } from "react";
import { client, ArenaError, getData } from "../../api/client";
import type { User } from "../../api/types";
import { config } from "../../lib/config";
import { performOAuthFlow } from "../../lib/oauth";

export type AuthState =
  | { status: "checking" }
  | { status: "login"; step: "opening" | "waiting" | "exchanging" }
  | { status: "login_error"; message: string }
  | { status: "ready"; user: User };

function startOAuth(
  setAuth: (state: AuthState) => void,
  cancelled: () => boolean,
) {
  setAuth({ status: "login", step: "opening" });

  performOAuthFlow(config.getClientId(), {
    onBrowserOpen: () => {
      if (!cancelled()) setAuth({ status: "login", step: "waiting" });
    },
    onCodeReceived: () => {
      if (!cancelled()) setAuth({ status: "login", step: "exchanging" });
    },
  })
    .then(async (token) => {
      if (cancelled()) return;
      config.setToken(token);
      const user = await getData(client.GET("/v3/me"));
      if (!cancelled()) setAuth({ status: "ready", user });
    })
    .catch((err: unknown) => {
      if (cancelled()) return;
      setAuth({
        status: "login_error",
        message: err instanceof Error ? err.message : String(err),
      });
    });
}

export function useSessionAuth(): AuthState {
  const [auth, setAuth] = useState<AuthState>({ status: "checking" });

  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;

    // No stored token: immediately start OAuth instead of making a failing API call.
    if (!config.getToken()) {
      startOAuth(setAuth, isCancelled);
      return () => {
        cancelled = true;
      };
    }

    getData(client.GET("/v3/me"))
      .then((user) => {
        if (!cancelled) setAuth({ status: "ready", user });
      })
      .catch((err: unknown) => {
        if (cancelled) return;

        if (
          err instanceof ArenaError &&
          (err.status === 401 || err.status === 403)
        ) {
          startOAuth(setAuth, isCancelled);
          return;
        }

        setAuth({
          status: "login_error",
          message:
            err instanceof Error
              ? `Failed to check session: ${err.message}`
              : "Failed to check session",
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return auth;
}
