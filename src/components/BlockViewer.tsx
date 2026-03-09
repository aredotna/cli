import { useEffect } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import useSWR from "swr";
import { client, getData } from "../api/client";
import { openUrl } from "../lib/open";
import { BlockContent } from "./BlockContent";
import { Spinner } from "./Spinner";

export function BlockViewer({
  blockIds,
  index,
  onBack,
  onNavigate,
}: {
  blockIds: number[];
  index: number;
  onBack: () => void;
  onNavigate: (index: number) => void;
}) {
  const id = blockIds[index]!;
  const { stdout } = useStdout();
  const clearViewport = () => {
    if (!stdout.isTTY) return;
    // Also clear scrollback to remove stale inline-image fragments.
    stdout.write("\u001B[2J\u001B[3J\u001B[H");
  };
  const hasPrev = index > 0;
  const hasNext = index < blockIds.length - 1;

  const {
    data: block,
    error,
    isLoading: loading,
  } = useSWR(`block/${id}`, () =>
    getData(client.GET("/v3/blocks/{id}", { params: { path: { id } } })),
  );

  useEffect(() => {
    // iTerm inline images can leave stale pixels when the next frame is
    // shorter; clear before drawing a new block.
    clearViewport();
  }, [id]);

  useInput((input, key) => {
    switch (true) {
      case input === "q" || key.escape:
        onBack();
        break;
      case key.leftArrow && hasPrev:
        clearViewport();
        onNavigate(index - 1);
        break;
      case key.rightArrow && hasNext:
        clearViewport();
        onNavigate(index + 1);
        break;
      case input === "o" && !!block:
        openUrl(`https://www.are.na/block/${block.id}`);
        break;
    }
  });

  if (loading) return <Spinner label={`Loading block ${id}`} />;

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">✕ {error.message}</Text>
        <Text dimColor> Press q to go back</Text>
      </Box>
    );
  }

  if (!block) return null;

  return (
    <Box flexDirection="column">
      <BlockContent block={block} />
      <Box marginTop={1}>
        <Text dimColor>
          {index + 1}/{blockIds.length}
          {" · "}
          {hasPrev ? "← prev" : ""}
          {hasPrev && hasNext ? " · " : ""}
          {hasNext ? "→ next" : ""}
          {" · "}o browser · esc back
        </Text>
      </Box>
    </Box>
  );
}
