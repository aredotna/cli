import { Box, Text, useInput } from "ink";
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
  const hasPrev = index > 0;
  const hasNext = index < blockIds.length - 1;

  const {
    data: block,
    error,
    isLoading: loading,
  } = useSWR(`block/${id}`, () =>
    getData(client.GET("/v3/blocks/{id}", { params: { path: { id } } })),
  );

  useInput((input, key) => {
    switch (true) {
      case input === "q" || key.escape:
        onBack();
        break;
      case key.leftArrow && hasPrev:
        onNavigate(index - 1);
        break;
      case key.rightArrow && hasNext:
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
