import { Box, Text, useInput } from "ink";
import useSWR from "swr";
import { client, getData } from "../api/client";
import { clearTerminalViewport } from "../lib/terminalViewport";
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
  const id = blockIds[index];
  const hasValidSelection = typeof id === "number";
  const hasPrev = index > 0;
  const hasNext = index < blockIds.length - 1;

  const {
    data: block,
    error,
    isLoading: loading,
  } = useSWR(
    hasValidSelection ? `block/${id}` : null,
    hasValidSelection && id !== undefined
      ? () =>
          getData(client.GET("/v3/blocks/{id}", { params: { path: { id } } }))
      : null,
  );

  useInput((input, key) => {
    switch (true) {
      case input === "q" || key.escape:
        clearTerminalViewport();
        onBack();
        break;
      case key.leftArrow && hasPrev:
        clearTerminalViewport();
        onNavigate(index - 1);
        break;
      case key.rightArrow && hasNext:
        clearTerminalViewport();
        onNavigate(index + 1);
        break;
      case input === "o" && !!block:
        openUrl(`https://www.are.na/block/${block.id}`);
        break;
    }
  });

  if (!hasValidSelection) {
    return (
      <Box flexDirection="column">
        <Text dimColor>Block is no longer available in this view</Text>
        <Text dimColor>Press q to go back</Text>
      </Box>
    );
  }

  if (loading) return <Spinner label={`Loading block ${id}`} />;

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">✕ {error.message}</Text>
        <Text dimColor> Press q to go back</Text>
      </Box>
    );
  }

  if (!block) {
    return (
      <Box flexDirection="column">
        <Text dimColor>Block unavailable</Text>
        <Text dimColor>Press q to go back</Text>
      </Box>
    );
  }

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
