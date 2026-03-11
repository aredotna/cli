import { Box, useInput } from "ink";
import useSWR from "swr";
import { client, getData } from "../api/client";
import { clearTerminalViewport } from "../lib/terminalViewport";
import { openUrl } from "../lib/open";
import { ScreenFrame } from "./ScreenChrome";
import { useSessionPaletteActive } from "./SessionPaletteContext";
import { BlockContent } from "./BlockContent";
import { ScreenError, ScreenLoading, ScreenUnavailable } from "./ScreenStates";

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
  const paletteActive = useSessionPaletteActive();

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
    if (paletteActive) return;
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
      <ScreenUnavailable message="Block is no longer available in this view" />
    );
  }

  if (loading) return <ScreenLoading label={`Loading block ${id}`} />;

  if (error) return <ScreenError message={error.message} />;

  if (!block) return <ScreenUnavailable message="Block unavailable" />;

  return (
    <ScreenFrame title={block.title || `Block ${block.id}`}>
      <Box paddingX={1}>
        <BlockContent block={block} showTitle={false} />
      </Box>
    </ScreenFrame>
  );
}
