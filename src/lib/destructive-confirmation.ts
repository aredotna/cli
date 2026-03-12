import { createInterface } from "node:readline/promises";
import type { Flags } from "./args";

export interface DestructiveSubcommandConfig {
  resourceArgIndex?: number;
  resourceLabel?: string;
}

export interface DestructiveCommandConfig {
  subcommands?: Record<string, DestructiveSubcommandConfig>;
}

export interface DestructiveAction {
  command: string;
  action: string;
  resourceLabel: string;
  resourceId: string;
}

export function destructiveActionForArgs(
  command: string | undefined,
  args: string[],
  config?: DestructiveCommandConfig,
): DestructiveAction | undefined {
  const subcommand = args[0];
  if (!subcommand) return undefined;

  const explicit = config?.subcommands?.[subcommand];

  // Fallback policy: any "<command> delete <id>" is considered destructive.
  if (!explicit && subcommand !== "delete") return undefined;

  const resourceArgIndex = explicit?.resourceArgIndex ?? 1;
  const resourceId = args[resourceArgIndex]?.trim();
  if (!resourceId) return undefined;

  const commandName = command ?? "resource";
  const resourceLabel = explicit?.resourceLabel ?? `${commandName} id`;

  return {
    command: commandName,
    action: subcommand,
    resourceLabel,
    resourceId,
  };
}

export function hasConfirmationBypass(flags: Flags): boolean {
  return flags["yes"] !== undefined || flags["y"] !== undefined;
}

export async function confirmDestructiveIfNeeded(
  command: string | undefined,
  args: string[],
  flags: Flags,
  config?: DestructiveCommandConfig,
): Promise<void> {
  const action = destructiveActionForArgs(command, args, config);
  if (!action || hasConfirmationBypass(flags)) return;

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      `Destructive command requires confirmation. Re-run with --yes to bypass: ${action.command} delete ${action.resourceId}`,
    );
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    process.stdout.write(
      `Confirm destructive action: ${action.command} ${action.action} ${action.resourceId}\n`,
    );

    const typed = (
      await rl.question(`Retype the ${action.resourceLabel} to continue: `)
    ).trim();

    if (typed !== action.resourceId) {
      throw new Error(
        `Confirmation failed. Expected ${action.resourceLabel} \"${action.resourceId}\".`,
      );
    }
  } finally {
    rl.close();
  }
}
