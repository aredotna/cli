import React, { useEffect, useState } from "react";
import { Box, Text, useApp } from "ink";
import { flag, flagAs, intFlag, requireArg, type Flags } from "../lib/args";
import { truncate } from "../lib/format";
import { KeyHints, Panel, ScreenFrame } from "../components/ScreenChrome";
import { Spinner } from "../components/Spinner";
import { cancellationSignal } from "../lib/network";
import {
  executeDownload,
  downloadExitCode,
  type DownloadEvent,
  type DownloadSummary,
  type ImageSize,
} from "../lib/download";

export interface DownloadCommandOptions {
  slug: string;
  directory?: string;
  size: ImageSize;
  concurrency: number;
  includeText: boolean;
  type?: string;
  overwrite: boolean;
}

export function parseDownloadOptions(
  args: string[],
  flags: Flags,
): DownloadCommandOptions {
  return {
    slug: requireArg(args, 0, "slug"),
    directory: flag(flags, "dir"),
    size: flagAs<ImageSize>(flags, "size") ?? "original",
    concurrency: intFlag(flags, "concurrency") ?? 4,
    includeText: flags["include-text"] !== undefined,
    type: flag(flags, "type"),
    overwrite: flags["overwrite"] !== undefined,
  };
}

function progressBar(completed: number, total: number, width = 28): string {
  if (total <= 0) return `[${"░".repeat(width)}]`;
  const ratio = Math.max(0, Math.min(1, completed / total));
  const filled = Math.round(ratio * width);
  return `[${"█".repeat(filled)}${"░".repeat(width - filled)}]`;
}

type Phase = "listing" | "downloading" | "done" | "error";

export function DownloadCommand(options: DownloadCommandOptions) {
  const { exit } = useApp();
  const [phase, setPhase] = useState<Phase>("listing");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<DownloadSummary | null>(null);
  const [listed, setListed] = useState(0);
  const [progress, setProgress] = useState({
    completed: 0,
    total: 0,
    downloaded: 0,
    skipped: 0,
    failed: 0,
  });
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    const onEvent = (event: DownloadEvent) => {
      if (cancelled) return;
      switch (event.type) {
        case "list_progress":
          setListed(event.fetched);
          break;
        case "list_completed":
          setProgress((prev) => ({ ...prev, total: event.downloadable }));
          setPhase("downloading");
          break;
        case "file_progress":
          setProgress({
            completed: event.completed,
            total: event.total,
            downloaded: event.downloaded,
            skipped: event.skipped,
            failed: event.failed,
          });
          setRecent((prev) => [event.file, ...prev].slice(0, 8));
          break;
      }
    };

    const run = async () => {
      try {
        const result = await executeDownload({
          ...options,
          onEvent,
          signal: cancellationSignal(),
        });
        if (cancelled) return;
        setSummary(result);
        if (downloadExitCode(result) !== 0) process.exitCode = 1;
        setPhase("done");
      } catch (err: unknown) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
        setPhase("error");
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase === "done" || phase === "error") exit();
  }, [phase, exit]);

  if (phase === "listing") {
    return <Spinner label={`Listing ${options.slug} (${listed} blocks)`} />;
  }

  if (phase === "error") {
    return <Text color="red">✕ {error ?? "Download failed"}</Text>;
  }

  if (phase === "downloading") {
    return (
      <ScreenFrame title={`download ${options.slug}`}>
        <Box flexDirection="column" gap={1}>
          <Text dimColor>
            concurrency {options.concurrency} · size {options.size}
          </Text>
          <Panel title="Downloads">
            <Box flexDirection="column">
              <Text>
                {progress.completed}/{progress.total}{" "}
                {progressBar(progress.completed, progress.total)}
              </Text>
              <Text dimColor>
                downloaded: {progress.downloaded} · skipped: {progress.skipped}{" "}
                · failed: {progress.failed}
              </Text>
            </Box>
          </Panel>
          {recent.length > 0 ? (
            <Panel title="Recent">
              <Box flexDirection="column">
                {recent.map((file, index) => (
                  <Text key={`${file}-${index}`}>· {truncate(file, 84)}</Text>
                ))}
              </Box>
            </Panel>
          ) : null}
          <KeyHints items={[{ key: "ctrl+c", label: "cancel" }]} />
        </Box>
      </ScreenFrame>
    );
  }

  if (!summary) return null;

  return (
    <ScreenFrame title={`download ${options.slug}`}>
      <Box flexDirection="column">
        <Text color={downloadExitCode(summary) === 0 ? "green" : "yellow"}>
          {downloadExitCode(summary) === 0 ? "✓" : "!"} Download finished
        </Text>
        <Text dimColor>
          listed {summary.listed} · downloaded {summary.downloaded} · skipped{" "}
          {summary.skipped} · failed {summary.failed}
        </Text>
        <Text dimColor>→ {summary.directory}</Text>
        {summary.failures.slice(0, 3).map((failure, index) => (
          <Text key={`failure-${index}`} color="red">
            fail: {truncate(failure.file, 64)} · {failure.error}
          </Text>
        ))}
      </Box>
    </ScreenFrame>
  );
}

export async function runDownloadJsonStream(
  options: DownloadCommandOptions,
  write: (event: DownloadEvent) => void,
): Promise<number> {
  const summary = await executeDownload({
    ...options,
    onEvent: write,
    signal: cancellationSignal(),
  });
  return downloadExitCode(summary);
}
