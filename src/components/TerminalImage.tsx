import { useEffect, useMemo, useState } from "react";
import { Box, Text, useStdout } from "ink";
import useSWR from "swr";
import terminalImage from "terminal-image";
import { Spinner } from "./Spinner";

interface TerminalImageProps {
  src: string;
  width?: number;
}

async function renderImage(
  buffer: Buffer,
  width: number,
  preferNativeRender: boolean,
): Promise<string> {
  const output = await terminalImage.buffer(buffer, {
    width,
    preserveAspectRatio: true,
    preferNativeRender,
  });
  return output;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isLikelyITermTmux(): boolean {
  return process.env.TERM_PROGRAM === "iTerm.app" && Boolean(process.env.TMUX);
}

class TerminalImageError extends Error {
  reason: "fetch" | "render";
  details: string[];

  constructor(
    reason: "fetch" | "render",
    message: string,
    details: string[] = [],
  ) {
    super(message);
    this.name = "TerminalImageError";
    this.reason = reason;
    this.details = details;
  }
}

interface RenderResult {
  output: string;
  native: boolean;
}

async function fetchAndRender(
  src: string,
  width: number,
): Promise<RenderResult> {
  let response: Response;
  try {
    response = await fetch(src);
  } catch (err: unknown) {
    throw new TerminalImageError("fetch", "Image request failed", [
      `url: ${src}`,
      `error: ${errorMessage(err)}`,
    ]);
  }
  if (!response.ok) {
    throw new TerminalImageError(
      "fetch",
      `Image request failed (${response.status})`,
      [`url: ${src}`],
    );
  }
  const arrayBuffer = await response.arrayBuffer();
  const imageBuffer = Buffer.from(arrayBuffer);
  let nativeError: unknown = null;

  try {
    // First attempt native protocols (iTerm/kitty/sixel) for best fidelity.
    const nativeOutput = await renderImage(imageBuffer, width, true);
    if (nativeOutput && nativeOutput.trim().length > 0) {
      return { output: nativeOutput, native: true };
    }
    nativeError = new Error("Native renderer produced no output");
  } catch (err: unknown) {
    nativeError = err;
    // Ignore and fall back to ANSI rendering below.
  }

  // Fall back to ANSI rendering for broader terminal compatibility.
  try {
    const ansiOutput = await renderImage(imageBuffer, width, false);
    if (ansiOutput && ansiOutput.trim().length > 0) {
      return { output: ansiOutput, native: false };
    }
    throw new Error("ANSI renderer produced no output");
  } catch (ansiError: unknown) {
    throw new TerminalImageError("render", "Image renderer failed", [
      `native: ${errorMessage(nativeError)}`,
      `ansi: ${errorMessage(ansiError)}`,
      `term: ${process.env.TERM ?? "unknown"}`,
      `term_program: ${process.env.TERM_PROGRAM ?? "unknown"}`,
      `tmux: ${process.env.TMUX ? "yes" : "no"}`,
    ]);
  }
}

export function TerminalImage({ src, width }: TerminalImageProps) {
  const { stdout } = useStdout();
  const debug = process.env.ARENA_IMAGE_DEBUG === "1";

  const resolvedWidth = useMemo(() => {
    if (width) return width;

    // Keep image safely below terminal width so Ink never wraps ANSI rows.
    const columns = stdout.columns ?? 100;
    const usableColumns = Math.max(40, columns - 6);
    const base = Math.max(20, Math.min(48, Math.floor(usableColumns * 0.5)));
    return base - (base % 2);
  }, [width, stdout.columns]);

  const { data, error, isLoading } = useSWR(
    `terminal-image:${src}:${resolvedWidth}`,
    () => fetchAndRender(src, resolvedWidth),
  );

  // Write native protocol output directly to stdout, bypassing Ink's text
  // processing which mangles proprietary escape sequences (e.g. iTerm2's
  // \x1b]1337;File=... inline image protocol).
  const [nativeWritten, setNativeWritten] = useState(false);
  useEffect(() => {
    if (data?.native && !nativeWritten) {
      process.stdout.write(data.output);
      setNativeWritten(true);
    }
  }, [data, nativeWritten]);

  if (isLoading) return <Spinner label="Loading image" />;
  if (error || !data) {
    const renderError = error instanceof TerminalImageError ? error : null;

    return (
      <Box flexDirection="column">
        <Text dimColor>
          [image unavailable
          {renderError ? `: ${renderError.reason}` : ""}]
        </Text>
        {renderError?.reason === "fetch" && (
          <Text dimColor>
            image download failed; check network/proxy and try again
          </Text>
        )}
        {renderError?.reason === "render" && isLikelyITermTmux() && (
          <Text dimColor>
            iTerm2 + tmux detected; enable tmux passthrough for inline images
          </Text>
        )}
        {renderError?.reason === "render" && (
          <Text dimColor>
            using ANSI fallback; set `ARENA_IMAGE_DEBUG=1` for renderer details
          </Text>
        )}
        {debug && renderError?.details?.length ? (
          <Box flexDirection="column">
            {renderError.details.map((detail) => (
              <Text key={detail} dimColor>
                {detail}
              </Text>
            ))}
          </Box>
        ) : null}
      </Box>
    );
  }

  // Native output was written directly to stdout; render an empty placeholder
  // so Ink's layout accounts for the space.
  if (data.native) {
    return <Box />;
  }

  // ANSI block character output is safe to render through Ink's <Text>.
  return <Text>{data.output}</Text>;
}
