import { useEffect, useMemo, useState } from "react";
import { Box, Text, useStdout } from "ink";
import terminalImage from "terminal-image";
import { Spinner } from "./Spinner";

interface TerminalImageProps {
  src: string;
  width?: number;
}

export function TerminalImage({ src, width }: TerminalImageProps) {
  const [loading, setLoading] = useState(true);
  const [output, setOutput] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const { stdout } = useStdout();

  const resolvedWidth = useMemo(() => {
    if (width) return width;

    // Keep image safely below terminal width so Ink never wraps ANSI rows.
    const columns = stdout.columns ?? 100;
    const usableColumns = Math.max(40, columns - 6);
    const base = Math.max(20, Math.min(48, Math.floor(usableColumns * 0.5)));
    return base - (base % 2);
  }, [width, stdout.columns]);

  useEffect(() => {
    let cancelled = false;

    async function renderImage() {
      setLoading(true);
      setFailed(false);
      setOutput(null);

      try {
        const response = await fetch(src);
        if (!response.ok) {
          throw new Error(`Image request failed (${response.status})`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const rendered = await terminalImage.buffer(Buffer.from(arrayBuffer), {
          width: resolvedWidth,
          preserveAspectRatio: true,
        });

        if (!cancelled) {
          setOutput(rendered);
        }
      } catch {
        if (!cancelled) {
          setFailed(true);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void renderImage();

    return () => {
      cancelled = true;
    };
  }, [src, resolvedWidth]);

  if (loading) return <Spinner label="Loading image" />;
  if (failed || !output) return <Text dimColor>[image unavailable]</Text>;

  return (
    <Box overflowX="hidden">
      <Text wrap="truncate-end">{output}</Text>
    </Box>
  );
}
