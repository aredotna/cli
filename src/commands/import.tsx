import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { flag, intFlag, requireArg, type Flags } from "../lib/args";
import { plural, truncate } from "../lib/format";
import { KeyHints, Panel, ScreenFrame } from "../components/ScreenChrome";
import {
  discoverImportFiles,
  executeImport,
  importExitCode,
  type ExecuteImportOptions,
  type ImportEvent,
  type ImportFile,
  type ImportSummary,
} from "../lib/import";
import { Spinner } from "../components/Spinner";

export interface ImportCommandOptions {
  channel: string;
  directory: string;
  recursive: boolean;
  interactive: boolean;
  batchSize: number;
  uploadConcurrency: number;
  pollIntervalMs: number;
}

export function parseImportOptions(
  args: string[],
  flags: Flags,
): ImportCommandOptions {
  return {
    channel: requireArg(args, 0, "channel"),
    directory: flag(flags, "dir") ?? ".",
    recursive: flags.recursive !== undefined,
    interactive: flags.interactive !== undefined,
    batchSize: intFlag(flags, "batch-size") ?? 100,
    uploadConcurrency: intFlag(flags, "upload-concurrency") ?? 4,
    pollIntervalMs: intFlag(flags, "poll-interval") ?? 2000,
  };
}

function progressBar(completed: number, total: number, width = 28): string {
  if (total <= 0) return `[${"░".repeat(width)}]`;
  const ratio = Math.max(0, Math.min(1, completed / total));
  const filled = Math.round(ratio * width);
  return `[${"█".repeat(filled)}${"░".repeat(width - filled)}]`;
}

interface UploadState {
  completed: number;
  total: number;
  uploaded: number;
  failed: number;
}

interface BatchState {
  processed: number;
  total: number;
  completedBatches: number;
  totalBatches: number;
}

type Phase = "discovering" | "selecting" | "running" | "done" | "error";

interface SelectionScreenProps {
  channel: string;
  directory: string;
  recursive: boolean;
  files: ImportFile[];
  selected: Set<number>;
  cursor: number;
  error: string | null;
  onMoveCursor: (delta: number) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onToggleFile: (fileIndex: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

function ImportSelectionScreen({
  channel,
  directory,
  recursive,
  files,
  selected,
  cursor,
  error,
  onMoveCursor,
  onSelectAll,
  onDeselectAll,
  onToggleFile,
  onConfirm,
  onCancel,
}: SelectionScreenProps) {
  const totalSelectable = files.length;
  const visibleWindow = Math.max(
    8,
    Math.min(20, (process.stdout.rows ?? 24) - 10),
  );

  const visibleSelectionIndexes = useMemo(() => {
    let start = Math.max(0, cursor - Math.floor(visibleWindow / 2));
    let end = Math.min(totalSelectable, start + visibleWindow);
    start = Math.max(0, end - visibleWindow);

    return { start, end };
  }, [cursor, totalSelectable, visibleWindow]);

  useInput((input, key) => {
    if (input === "q" || key.escape) {
      onCancel();
      return;
    }

    if (key.upArrow || input === "k") {
      onMoveCursor(-1);
      return;
    }

    if (key.downArrow || input === "j") {
      onMoveCursor(1);
      return;
    }

    if (input === "a") {
      onSelectAll();
      return;
    }

    if (input === "d") {
      onDeselectAll();
      return;
    }

    if (input === " ") {
      if (!files[cursor]) return;
      onToggleFile(cursor);
      return;
    }

    if (input === "c") {
      onConfirm();
      return;
    }

    if (!key.return) return;

    if (!files[cursor]) return;
    onToggleFile(cursor);
  });

  return (
    <ScreenFrame title={`import ${channel}`}>
      <Box flexDirection="column" gap={1}>
        <Panel title="Select files">
          <Box flexDirection="column">
            {Array.from(
              {
                length:
                  visibleSelectionIndexes.end - visibleSelectionIndexes.start,
              },
              (_, offset) => visibleSelectionIndexes.start + offset,
            ).map((rowIndex) => {
              const selectedCursor = rowIndex === cursor;
              const file = files[rowIndex]!;
              const checked = selected.has(rowIndex);

              return (
                <Text key={file.relativePath}>
                  <Text color={selectedCursor ? "cyan" : undefined}>
                    {selectedCursor ? "▸ " : "  "}
                  </Text>
                  <Text
                    color={checked ? "green" : undefined}
                    dimColor={!checked}
                  >
                    [{checked ? "x" : " "}]
                  </Text>{" "}
                  {truncate(file.relativePath, 88)}
                </Text>
              );
            })}
          </Box>
        </Panel>

        <Text dimColor>
          Selected {selected.size}/{files.length}
        </Text>
        {error ? <Text color="red">✕ {error}</Text> : null}

        <KeyHints
          items={[
            { key: "↑/↓", label: "move" },
            { key: "space", label: "toggle" },
            { key: "↵", label: "toggle" },
            { key: "a", label: "select all" },
            { key: "d", label: "deselect all" },
            { key: "c", label: "confirm" },
            { key: "q", label: "cancel" },
          ]}
        />
      </Box>
    </ScreenFrame>
  );
}

export function ImportCommand({
  channel,
  directory,
  recursive,
  interactive,
  batchSize,
  uploadConcurrency,
  pollIntervalMs,
}: ImportCommandOptions) {
  const { exit } = useApp();
  const [phase, setPhase] = useState<Phase>("discovering");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [discoveredFiles, setDiscoveredFiles] = useState<ImportFile[]>([]);
  const [runFiles, setRunFiles] = useState<ImportFile[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [cursor, setCursor] = useState(0);
  const [upload, setUpload] = useState<UploadState>({
    completed: 0,
    total: 0,
    uploaded: 0,
    failed: 0,
  });
  const [uploadStatuses, setUploadStatuses] = useState<
    Array<"pending" | "uploaded" | "failed">
  >([]);
  const [batch, setBatch] = useState<BatchState>({
    processed: 0,
    total: 0,
    completedBatches: 0,
    totalBatches: 0,
  });
  const [batchStatusById, setBatchStatusById] = useState<
    Record<string, string>
  >({});

  const canUseInteractive =
    interactive && Boolean(process.stdin.isTTY && process.stdout.isTTY);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        if (interactive && !canUseInteractive) {
          throw new Error("--interactive requires a TTY terminal");
        }

        const files = await discoverImportFiles(directory, recursive);
        if (cancelled) return;

        setDiscoveredFiles(files);
        setSelected(new Set(files.map((_, index) => index)));

        if (canUseInteractive) {
          setPhase("selecting");
          return;
        }

        setRunFiles(files);
        setUploadStatuses(files.map(() => "pending"));
        setUpload({
          completed: 0,
          total: files.length,
          uploaded: 0,
          failed: 0,
        });
        setPhase("running");
      } catch (err: unknown) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setPhase("error");
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [directory, recursive, canUseInteractive, interactive]);

  useEffect(() => {
    if (phase !== "running" || !runFiles) return;

    let cancelled = false;

    const onEvent = (event: ImportEvent) => {
      if (cancelled) return;

      switch (event.type) {
        case "upload_progress":
          setUpload({
            completed: event.completed,
            total: event.total,
            uploaded: event.uploaded,
            failed: event.failed,
          });
          setUploadStatuses((prev) => {
            const next = [...prev];
            if (next[event.index] !== "failed") {
              next[event.index] = "uploaded";
            }
            return next;
          });
          break;
        case "upload_file_failed":
          setUploadStatuses((prev) => {
            const next = [...prev];
            next[event.index] = "failed";
            return next;
          });
          break;
        case "batch_submitted":
          setBatch((prev) => ({
            ...prev,
            totalBatches: event.batch_total,
          }));
          break;
        case "batch_status":
          setBatchStatusById((prev) => ({
            ...prev,
            [event.batch_id]: event.status,
          }));
          break;
        case "batch_progress":
          setBatch((prev) => ({
            ...prev,
            processed: event.processed,
            total: event.total,
            completedBatches: event.completed_batches,
            totalBatches: event.total_batches,
          }));
          break;
      }
    };

    const run = async () => {
      try {
        const runOptions: ExecuteImportOptions = {
          channel,
          directory,
          recursive,
          selectedFiles: runFiles,
          discoveredCount: discoveredFiles.length,
          batchSize,
          uploadConcurrency,
          pollIntervalMs,
          onEvent,
        };

        const result = await executeImport(runOptions);
        if (cancelled) return;

        setSummary(result);
        if (importExitCode(result) !== 0) {
          process.exitCode = 1;
        }
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
  }, [
    phase,
    runFiles,
    channel,
    directory,
    recursive,
    discoveredFiles.length,
    batchSize,
    uploadConcurrency,
    pollIntervalMs,
  ]);

  useEffect(() => {
    if (phase === "done" || phase === "error") {
      exit();
    }
  }, [phase, exit]);

  if (phase === "discovering") {
    return <Spinner label={`Scanning ${directory}`} />;
  }

  if (phase === "selecting") {
    return (
      <ImportSelectionScreen
        channel={channel}
        directory={directory}
        recursive={recursive}
        files={discoveredFiles}
        selected={selected}
        cursor={cursor}
        error={error}
        onMoveCursor={(delta) => {
          const maxCursor = Math.max(0, discoveredFiles.length - 1);
          setCursor((prev) => {
            if (discoveredFiles.length === 0) return 0;
            if (delta < 0) return prev <= 0 ? maxCursor : prev - 1;
            return prev >= maxCursor ? 0 : prev + 1;
          });
        }}
        onSelectAll={() => {
          setSelected(new Set(discoveredFiles.map((_, index) => index)));
          setError(null);
        }}
        onDeselectAll={() => {
          setSelected(new Set());
          setError(null);
        }}
        onToggleFile={(fileIndex) => {
          setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(fileIndex)) {
              next.delete(fileIndex);
            } else {
              next.add(fileIndex);
            }
            return next;
          });
          setError(null);
        }}
        onConfirm={() => {
          if (selected.size === 0) {
            setError("Select at least one file");
            return;
          }
          const selectedFiles = [...selected]
            .sort((a, b) => a - b)
            .map((index) => discoveredFiles[index]!)
            .filter(Boolean);
          setUploadStatuses(selectedFiles.map(() => "pending"));
          setUpload({
            completed: 0,
            total: selectedFiles.length,
            uploaded: 0,
            failed: 0,
          });
          setBatch({
            processed: 0,
            total: selectedFiles.length,
            completedBatches: 0,
            totalBatches: 0,
          });
          setBatchStatusById({});
          setRunFiles(selectedFiles);
          setError(null);
          setPhase("running");
        }}
        onCancel={() => {
          process.exitCode = 1;
          setError("Import cancelled");
          setPhase("error");
        }}
      />
    );
  }

  if (phase === "running") {
    const batchList = Object.entries(batchStatusById);

    return (
      <ScreenFrame title={`import ${channel}`}>
        <Box flexDirection="column" gap={1}>
          <Text dimColor>
            Upload concurrency {uploadConcurrency} · batch size {batchSize}
          </Text>

          <Panel title="Uploads">
            <Box flexDirection="column">
              <Text>
                {upload.completed}/{upload.total}{" "}
                {progressBar(upload.completed, upload.total)}
              </Text>
              <Text dimColor>
                successful: {upload.uploaded} · failed: {upload.failed}
              </Text>
            </Box>
          </Panel>

          <Panel title="Batches">
            <Box flexDirection="column">
              <Text>
                {batch.processed}/{batch.total}{" "}
                {progressBar(batch.processed, batch.total)}
              </Text>
              <Text dimColor>
                completed: {batch.completedBatches}/{batch.totalBatches}
              </Text>
            </Box>
          </Panel>

          {runFiles && runFiles.length > 0 ? (
            <Panel title="Files">
              <Box flexDirection="column">
                {runFiles.slice(0, 12).map((file, index) => {
                  const status = uploadStatuses[index] ?? "pending";
                  const marker =
                    status === "uploaded"
                      ? "✓"
                      : status === "failed"
                        ? "✕"
                        : "·";

                  return (
                    <Text key={file.relativePath}>
                      {marker} {truncate(file.relativePath, 84)}
                    </Text>
                  );
                })}
                {runFiles.length > 12 ? (
                  <Text dimColor>…and {runFiles.length - 12} more</Text>
                ) : null}
              </Box>
            </Panel>
          ) : null}

          {batchList.length > 0 ? (
            <Panel title="Batch status">
              <Box flexDirection="column">
                {batchList.map(([batchId, status]) => (
                  <Text key={batchId}>
                    {batchId} <Text dimColor>{status}</Text>
                  </Text>
                ))}
              </Box>
            </Panel>
          ) : null}
        </Box>
      </ScreenFrame>
    );
  }

  if (phase === "error") {
    return <Text color="red">✕ {error ?? "Import failed"}</Text>;
  }

  if (!summary) return null;

  return (
    <ScreenFrame title={`import ${channel}`}>
      <Box flexDirection="column">
        <Text color={importExitCode(summary) === 0 ? "green" : "yellow"}>
          {importExitCode(summary) === 0 ? "✓" : "!"} Import finished
        </Text>
        <Text dimColor>
          discovered {summary.discovered} · selected {summary.selected} ·
          uploaded {summary.uploaded}
        </Text>
        <Text dimColor>
          upload_failed {summary.upload_failed} · batch_successful{" "}
          {summary.batch_successful} · batch_failed {summary.batch_failed}
        </Text>
        {summary.upload_failures.slice(0, 3).map((failure, index) => (
          <Text key={`upload-failure-${index}`} color="red">
            upload fail: {truncate(failure.file, 64)} · {failure.error}
          </Text>
        ))}
        {summary.batch_failures.slice(0, 3).map((failure, index) => (
          <Text key={`batch-failure-${index}`} color="red">
            batch fail: {truncate(failure.file, 64)} · {failure.error}
          </Text>
        ))}
      </Box>
    </ScreenFrame>
  );
}

export async function runImportJsonStream(
  options: ImportCommandOptions,
  write: (event: ImportEvent) => void,
): Promise<number> {
  if (options.interactive) {
    throw new Error("--interactive cannot be used with --json");
  }

  const summary = await executeImport({
    channel: options.channel,
    directory: options.directory,
    recursive: options.recursive,
    batchSize: options.batchSize,
    uploadConcurrency: options.uploadConcurrency,
    pollIntervalMs: options.pollIntervalMs,
    onEvent: write,
  });

  return importExitCode(summary);
}
