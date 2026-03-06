import { exec } from "child_process";
import { platform } from "os";

export function openUrl(url: string): void {
  const p = platform();
  const cmd = p === "darwin" ? "open" : p === "win32" ? "start" : "xdg-open";
  exec(`${cmd} '${url}'`);
}
