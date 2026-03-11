import { useEffect, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import useSWR from "swr";
import { client, getData } from "../api/client";
import type { Block } from "../api/types";
import { openUrl } from "../lib/open";
import { clampBlockIndex } from "../lib/session-nav";
import { clearTerminalViewport } from "../lib/terminalViewport";
import { ScreenFrame } from "./ScreenChrome";
import { ScreenError, ScreenLoading, ScreenUnavailable } from "./ScreenStates";
import { useSessionFooter } from "./SessionFooterContext";
import { useSessionPaletteActive } from "./SessionPaletteContext";
import { BlockContent } from "./BlockContent";

export function ChannelBlockViewer({
  slug,
  initialPage,
  per,
  index: initialIndex,
  onBack,
  onNavigate,
}: {
  slug: string;
  initialPage: number;
  per: number;
  index: number;
  onBack: (state: { page: number; cursor: number }) => void;
  onNavigate: (state: { page: number; index: number }) => void;
}) {
  const initialStateRef = useRef({ page: initialPage, index: initialIndex });
  const [page, setPage] = useState(initialStateRef.current.page);
  const [index, setIndex] = useState(initialStateRef.current.index);
  const [pendingBoundary, setPendingBoundary] = useState<
    "prev" | "next" | null
  >(null);
  const paletteActive = useSessionPaletteActive();

  const {
    data: contents,
    error: contentsError,
    isLoading: contentsLoading,
  } = useSWR(`channel/${slug}/contents?page=${page}&per=${per}`, () =>
    getData(
      client.GET("/v3/channels/{id}/contents", {
        params: {
          path: { id: slug },
          query: { page, per, sort: "position_desc" },
        },
      }),
    ),
  );

  const items = contents?.data ?? [];
  const blocks = items.filter((item) => item.type !== "Channel") as Block[];
  const currentBlock = blocks[index];
  const currentId = currentBlock?.id;

  useEffect(() => {
    if (!pendingBoundary) return;
    const nextIndex =
      pendingBoundary === "next" ? 0 : Math.max(0, blocks.length - 1);
    setIndex(nextIndex);
    onNavigate({ page, index: nextIndex });
    setPendingBoundary(null);
  }, [pendingBoundary, blocks.length, page, onNavigate]);

  useEffect(() => {
    const normalized = clampBlockIndex(index, blocks.length);
    if (normalized === null || normalized === index) return;
    setIndex(normalized);
    onNavigate({ page, index: normalized });
  }, [index, blocks.length, onNavigate, page]);

  const {
    data: block,
    error: blockError,
    isLoading: blockLoading,
  } = useSWR(
    currentId ? `block/${currentId}` : null,
    currentId
      ? () =>
          getData(
            client.GET("/v3/blocks/{id}", {
              params: { path: { id: currentId } },
            }),
          )
      : null,
  );

  const hasPrev = index > 0 || page > 1;
  const hasNext = index < blocks.length - 1 || !!contents?.meta?.has_more_pages;
  const currentItemIndex = currentBlock
    ? items.findIndex((item) => item.id === currentBlock.id)
    : -1;
  const globalIndex =
    contents && currentItemIndex >= 0
      ? (contents.meta.current_page - 1) * contents.meta.per_page +
        currentItemIndex +
        1
      : null;

  useSessionFooter([
    ...(hasPrev ? [{ key: "←", label: "prev" }] : []),
    ...(hasNext ? [{ key: "→", label: "next" }] : []),
    { key: "o", label: "browser" },
    { key: "q/esc", label: "back" },
  ]);

  useInput((input, key) => {
    if (paletteActive) return;
    switch (true) {
      case input === "q" || key.escape:
        clearTerminalViewport();
        onBack({
          page,
          cursor: Math.max(0, currentItemIndex),
        });
        break;
      case key.leftArrow:
        if (index > 0) {
          clearTerminalViewport();
          const nextIndex = index - 1;
          setIndex(nextIndex);
          onNavigate({ page, index: nextIndex });
          break;
        }
        if (page > 1 && !contentsLoading) {
          clearTerminalViewport();
          setPendingBoundary("prev");
          setPage((p) => p - 1);
        }
        break;
      case key.rightArrow:
        if (index < blocks.length - 1) {
          clearTerminalViewport();
          const nextIndex = index + 1;
          setIndex(nextIndex);
          onNavigate({ page, index: nextIndex });
          break;
        }
        if (contents?.meta?.has_more_pages && !contentsLoading) {
          clearTerminalViewport();
          setPendingBoundary("next");
          setPage((p) => p + 1);
        }
        break;
      case input === "o" && !!block:
        openUrl(`https://www.are.na/block/${block.id}`);
        break;
    }
  });

  if (contentsLoading || blockLoading)
    return <ScreenLoading label={`Loading block ${currentId ?? ""}`.trim()} />;

  if (contentsError || blockError) {
    const message =
      contentsError?.message ?? blockError?.message ?? "Failed to load block";
    return <ScreenError message={message} />;
  }

  if (!contents || blocks.length === 0) {
    return <ScreenUnavailable message="No blocks available on this page" />;
  }

  if (!currentBlock) {
    return (
      <ScreenFrame title="Recovering block selection">
        <Box paddingX={1}>
          <Text dimColor>Recovering block selection...</Text>
        </Box>
      </ScreenFrame>
    );
  }

  if (!block) return <ScreenUnavailable message="Block unavailable" />;

  return (
    <ScreenFrame title={block.title || `Block ${block.id}`}>
      <Box paddingX={1}>
        <BlockContent block={block} showTitle={false} />
      </Box>
    </ScreenFrame>
  );
}
