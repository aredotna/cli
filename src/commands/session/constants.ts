import { commands as registry } from "../../lib/registry";

export interface SessionCommand {
  name: string;
  args: string | null;
  desc: string;
}

export const COMMANDS: SessionCommand[] = [
  ...registry
    .filter((cmd) => cmd.session)
    .map((cmd) => ({
      name: cmd.name,
      args: cmd.session!.args,
      desc: cmd.session!.desc,
    })),
  { name: "channels", args: null, desc: "Your channels" },
];

export const ARG_HINTS: Record<string, string> = {
  "<slug>": "enter channel slug",
  "<query>": "enter search query",
  "<id>": "enter block ID",
};
