import React, { useEffect, useState } from "react";
import { join } from "node:path";
import { Box, Text, useApp } from "ink";
import { flag, intFlag, requireArg, type Flags } from "../lib/args";
import { ScreenFrame } from "../components/ScreenChrome";
import { Spinner } from "../components/Spinner";
import { cancellationSignal } from "../lib/network";
import { exitCodeFromError } from "../lib/exit-codes";
import { plural, progressBar, truncate } from "../lib/format";
import { DOWNLOAD_TYPES, IMAGE_SIZES } from "../lib/download-format";
import {
  executeDownload,
  downloadExitCode,
  validateDownloadOptions,
  type DownloadOptions,
  type DownloadSummary,
  type DownloadEvent,
} from "../lib/download";

function valueFlag(flags: Flags, name: string): string | undefined {
  if (
    flags[name] !== undefined &&
    (typeof flags[name] !== "string" || !String(flags[name]).trim())
  )
    throw new Error(`--${name} requires a value`);
  return flag(flags, name);
}
function booleanFlag(flags: Flags, name: string): boolean {
  const value = flags[name];
  if (value === undefined || value === false || value === "false") return false;
  if (value === true || value === "true") return true;
  throw new Error(`--${name} expects true or false`);
}
function choiceFlag<T extends string>(
  flags: Flags,
  name: string,
  choices: readonly T[],
): T | undefined {
  const raw = valueFlag(flags, name);
  if (raw === undefined) return undefined;
  const choice = choices.find(
    (value) => value.toLowerCase() === raw.toLowerCase(),
  );
  if (!choice)
    throw new Error(`--${name} must be one of: ${choices.join(", ")}`);
  return choice;
}
export function parseDownloadOptions(
  args: string[],
  flags: Flags,
): DownloadOptions {
  if (args.length > 2)
    throw new Error("Usage: arena download <channel> [directory] [flags]");
  const directory = valueFlag(flags, "dir");
  if (directory && args[1])
    throw new Error("Specify a directory either positionally or with --dir");
  const options: DownloadOptions = {
    channel: requireArg(args, 0, "channel"),
    directory: directory ?? args[1],
    size: choiceFlag(flags, "size", IMAGE_SIZES) ?? "original",
    type: choiceFlag(flags, "type", DOWNLOAD_TYPES),
    linkFormat:
      choiceFlag(flags, "link-format", ["webloc", "url"] as const) ?? "webloc",
    concurrency: intFlag(flags, "concurrency") ?? 4,
    overwrite: booleanFlag(flags, "overwrite"),
    prune: booleanFlag(flags, "prune"),
    zip: valueFlag(flags, "zip"),
  };
  validateDownloadOptions(options);
  return options;
}

interface Progress {
  label: string;
  completed: number;
  total: number;
}

export function DownloadCommand(options: DownloadOptions) {
  const { exit } = useApp();
  const [progress, setProgress] = useState<Progress>({
    label: "Listing channel contents",
    completed: 0,
    total: 0,
  });
  const [summary, setSummary] = useState<DownloadSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([cancellationSignal(), controller.signal]);
    let mounted = true;
    void executeDownload({
      ...options,
      signal,
      onEvent(event) {
        if (!mounted) return;
        if (event.type === "list_progress")
          setProgress({
            label: `Listing ${event.fetched}/${event.total} items`,
            completed: 0,
            total: 0,
          });
        if (event.type === "file_progress")
          setProgress({
            label: `${event.status} · ${truncate(event.file, 64)}`,
            completed: event.completed,
            total: event.total,
          });
        if (event.type === "archive_started")
          setProgress((current) => ({
            ...current,
            label: "Creating ZIP archive",
          }));
      },
    })
      .then((result) => {
        if (!mounted) return;
        process.exitCode = downloadExitCode(result);
        setSummary(result);
      })
      .catch((failure: unknown) => {
        if (!mounted) return;
        process.exitCode = signal.aborted ? 130 : exitCodeFromError(failure);
        setError(failure instanceof Error ? failure.message : String(failure));
      });
    return () => {
      mounted = false;
      controller.abort();
    };
  }, []);
  useEffect(() => {
    if (summary || error) exit();
  }, [summary, error, exit]);
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!summary) {
    if (progress.total === 0) return <Spinner label={progress.label} />;
    return (
      <Box flexDirection="column">
        <Text>
          {progress.completed}/{progress.total}{" "}
          {progressBar(progress.completed, progress.total)}
        </Text>
        <Spinner label={progress.label} />
      </Box>
    );
  }
  const ok = downloadExitCode(summary) === 0;
  const details = [
    summary.metadata_only ? `${summary.metadata_only} metadata only` : null,
    summary.retained
      ? options.type
        ? `${plural(summary.retained, "earlier file")} kept outside this filtered export`
        : `${plural(summary.retained, "earlier file")} not in this export (remove with --prune)`
      : null,
  ].filter(Boolean);
  return (
    <ScreenFrame title={`download ${options.channel}`}>
      <Box flexDirection="column">
        <Text color={ok ? "green" : "yellow"}>
          {ok ? "✓" : "!"}{" "}
          {summary.cancelled
            ? "Sync cancelled"
            : summary.failed
              ? "Sync finished with errors"
              : "Sync complete"}
        </Text>
        <Text dimColor>
          {summary.downloaded} downloaded · {summary.unchanged} unchanged ·{" "}
          {summary.renamed ? `${summary.renamed} renamed · ` : ""}
          {summary.failed} failed
          {options.prune ? ` · ${summary.pruned} pruned` : ""}
        </Text>
        {details.length ? <Text dimColor>{details.join(" · ")}</Text> : null}
        <Text>→ {join(summary.directory, "index.html")}</Text>
        {summary.zip ? <Text>→ {summary.zip}</Text> : null}
        {summary.failures.slice(0, 5).map((failure, index) => (
          <Text color="red" key={index}>
            {truncate(failure.file, 64)} · {failure.error}
          </Text>
        ))}
        {summary.failures.length > 5 ? (
          <Text dimColor>…and {summary.failures.length - 5} more</Text>
        ) : null}
      </Box>
    </ScreenFrame>
  );
}
export async function runDownloadJsonStream(
  options: DownloadOptions,
  write: (event: DownloadEvent) => void,
): Promise<number> {
  const signal = cancellationSignal();
  try {
    return downloadExitCode(
      await executeDownload({ ...options, signal, onEvent: write }),
    );
  } catch (error) {
    if (signal.aborted) return 130;
    throw error;
  }
}
