import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

interface ConfigData {
  token?: string;
  client_id?: string;
}

const CONFIG_DIR = join(homedir(), ".config", "arena");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

function read(): ConfigData {
  try {
    if (!existsSync(CONFIG_FILE)) return {};
    return JSON.parse(readFileSync(CONFIG_FILE, "utf-8")) as ConfigData;
  } catch {
    return {};
  }
}

function write(data: ConfigData): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2) + "\n", {
    mode: 0o600,
  });
}

export const config = {
  getToken(): string | undefined {
    return process.env["ARENA_TOKEN"] || read().token;
  },

  setToken(token: string): void {
    const current = read();
    current.token = token;
    write(current);
  },

  clearToken(): void {
    const current = read();
    delete current.token;
    write(current);
  },

  getClientId(): string {
    return (
      process.env["ARENA_CLIENT_ID"] ||
      read().client_id ||
      "a-2__kXA3JH0X5pMnYsFvY2BY9dVQ30sIBkgeoLoO90"
    );
  },

  setClientId(id: string): void {
    const current = read();
    current.client_id = id;
    write(current);
  },

  getConfigPath(): string {
    return CONFIG_FILE;
  },
};
