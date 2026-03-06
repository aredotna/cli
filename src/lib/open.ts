import { spawn } from "child_process";
import { platform } from "os";

function launch(command: string, args: string[]) {
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
  });
  child.on("error", () => {});
  child.unref();
}

export function openUrl(url: string): void {
  const p = platform();

  if (p === "darwin") return launch("open", [url]);
  if (p === "win32")
    return launch("rundll32", ["url.dll,FileProtocolHandler", url]);
  launch("xdg-open", [url]);
}
