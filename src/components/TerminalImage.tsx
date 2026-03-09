import { useMemo } from "react";
import { Box, Text, useStdout } from "ink";
import useSWR from "swr";
import terminalImage from "terminal-image";
import termImg from "term-img";
import { Spinner } from "./Spinner";

interface TerminalImageProps {
  src: string;
  width?: number;
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

  // Try native inline image protocols through term-img (iTerm2, WezTerm,
  // Konsole, etc). It returns a printable escape-sequence string and does
  // not write directly to stdout.
  try {
    const nativeOutput = termImg(imageBuffer, {
      width,
      fallback: () => "",
    });
    if (nativeOutput && nativeOutput.trim().length > 0) {
      return { output: nativeOutput, native: true };
    }
    nativeError = new Error("Terminal does not support inline images");
  } catch (err: unknown) {
    nativeError = err;
  }

  // Fall back to ANSI block-character rendering for broad compatibility.
  try {
    const ansiOutput = await terminalImage.buffer(imageBuffer, {
      width,
      preserveAspectRatio: true,
      preferNativeRender: false,
    });
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
          <Text dimColor>set `ARENA_IMAGE_DEBUG=1` for renderer details</Text>
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

  // Render both native protocol and ANSI fallback output through Ink so image
  // placement stays aligned with surrounding UI layout.
  return <Text>{data.output}</Text>;
}
