import { useMemo } from "react";
import { Box, Text, useStdout } from "ink";
import useSWR from "swr";
import terminalImage from "terminal-image";
import { Spinner } from "./Spinner";

interface TerminalImageProps {
  src: string;
  width?: number;
}

async function fetchAndRender(src: string, width: number): Promise<string> {
  const response = await fetch(src);
  if (!response.ok) {
    throw new Error(`Image request failed (${response.status})`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return terminalImage.buffer(Buffer.from(arrayBuffer), {
    width,
    preserveAspectRatio: true,
  });
}

export function TerminalImage({ src, width }: TerminalImageProps) {
  const { stdout } = useStdout();

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
  if (error || !data) return <Text dimColor>[image unavailable]</Text>;

  return (
    <Box overflowX="hidden">
      <Text wrap="truncate-end">{data}</Text>
    </Box>
  );
}
