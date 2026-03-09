import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { randomBytes, createHash } from "crypto";
import { openUrl } from "./open";

const AUTHORIZE_URL =
  process.env["ARENA_AUTHORIZE_URL"] || "https://www.are.na/oauth/authorize";
const TOKEN_URL = `${process.env["ARENA_API_URL"] || "https://api.are.na"}/v3/oauth/token`;

interface TokenResponse {
  access_token: string;
  token_type: string;
  scope?: string;
}

function generateVerifier(): string {
  return randomBytes(32).toString("base64url");
}

function generateChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function generateState(): string {
  return randomBytes(16).toString("base64url");
}

export interface OAuthCallbacks {
  onBrowserOpen?: () => void;
  onCodeReceived?: () => void;
}

export async function performOAuthFlow(
  clientId: string,
  callbacks?: OAuthCallbacks,
): Promise<string> {
  const verifier = generateVerifier();
  const challenge = generateChallenge(verifier);
  const state = generateState();

  // Find an open port and start the callback server
  const { code, redirectUri } = await new Promise<{
    code: string;
    redirectUri: string;
  }>((resolve, reject) => {
    let listenPort = 0;

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url!, `http://127.0.0.1:${listenPort}`);

      if (url.pathname !== "/callback") {
        res.writeHead(404);
        res.end();
        return;
      }

      const error = url.searchParams.get("error");
      if (error) {
        const desc = url.searchParams.get("error_description") || error;
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(resultPage(false, desc));
        clearTimeout(timeout);
        server.close();
        reject(new Error(desc));
        return;
      }

      const authCode = url.searchParams.get("code");
      if (!authCode) {
        res.writeHead(400);
        res.end();
        return;
      }

      const returnedState = url.searchParams.get("state");
      if (returnedState !== state) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(resultPage(false, "State mismatch"));
        clearTimeout(timeout);
        server.close();
        reject(new Error("OAuth state mismatch"));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(resultPage(true));
      clearTimeout(timeout);
      callbacks?.onCodeReceived?.();
      resolve({
        code: authCode,
        redirectUri: `http://127.0.0.1:${listenPort}/callback`,
      });
      server.close();
    });

    const timeout = setTimeout(() => {
      server.close();
      reject(new Error("Authorization timed out after 5 minutes"));
    }, 300_000);

    // Port 0 = let the OS pick an available port
    server.listen(0, "127.0.0.1", () => {
      listenPort = (server.address() as { port: number }).port;
      const redirect = `http://127.0.0.1:${listenPort}/callback`;

      const authUrl = new URL(AUTHORIZE_URL);
      authUrl.searchParams.set("client_id", clientId);
      authUrl.searchParams.set("redirect_uri", redirect);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", "write");
      authUrl.searchParams.set("code_challenge", challenge);
      authUrl.searchParams.set("code_challenge_method", "S256");
      authUrl.searchParams.set("state", state);

      callbacks?.onBrowserOpen?.();
      openUrl(authUrl.toString());
    });
  });

  // Exchange code for token
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: verifier,
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(
      data?.error_description || data?.error || "Token exchange failed",
    );
  }

  const data = (await response.json()) as TokenResponse;
  return data.access_token;
}

function resultPage(success: boolean, message?: string): string {
  const color = success ? "#17ac10" : "#e53e3e";
  const icon = success ? "✓" : "✕";
  const title = escapeHtml(success ? "Authenticated" : "Authorization Failed");
  const body = escapeHtml(
    success
      ? "You can close this tab and return to the terminal."
      : message || "Something went wrong.",
  );

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f8f8f8;color:#333}
.c{text-align:center;padding:3rem 4rem}
.i{font-size:3rem;color:${color};margin-bottom:1.5rem}
h1{font-size:1.25rem;font-weight:600;margin-bottom:.5rem}
p{color:#888;font-size:.9rem}
</style></head>
<body><div class="c">
<div class="i">${icon}</div>
<h1>${title}</h1>
<p>${body}</p>
</div></body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
