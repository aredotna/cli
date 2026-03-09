import { useEffect, useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import useSWR from "swr";
import { client, getData } from "../api/client";
import type { Block } from "../api/types";
import { openUrl } from "../lib/open";
import { BlockContent } from "./BlockContent";
import { Spinner } from "./Spinner";

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
  const { stdout } = useStdout();
  const clearViewport = () => {
    if (!stdout.isTTY) return;
    // Also clear scrollback to remove stale inline-image fragments.
    stdout.write("\u001B[2J\u001B[3J\u001B[H");
  };
  const [page, setPage] = useState(initialPage);
  const [index, setIndex] = useState(initialIndex);
  const [pendingBoundary, setPendingBoundary] = useState<
    "prev" | "next" | null
  >(null);

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
    clearViewport();
  }, [currentId]);

  useEffect(() => {
    if (!pendingBoundary) return;
    const nextIndex =
      pendingBoundary === "next" ? 0 : Math.max(0, blocks.length - 1);
    setIndex(nextIndex);
    onNavigate({ page, index: nextIndex });
    setPendingBoundary(null);
  }, [pendingBoundary, blocks.length, page, onNavigate]);

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

  useInput((input, key) => {
    switch (true) {
      case input === "q" || key.escape:
        onBack({
          page,
          cursor: Math.max(0, currentItemIndex),
        });
        break;
      case key.leftArrow:
        if (index > 0) {
          clearViewport();
          const nextIndex = index - 1;
          setIndex(nextIndex);
          onNavigate({ page, index: nextIndex });
          break;
        }
        if (page > 1 && !contentsLoading) {
          clearViewport();
          setPendingBoundary("prev");
          setPage((p) => p - 1);
        }
        break;
      case key.rightArrow:
        if (index < blocks.length - 1) {
          clearViewport();
          const nextIndex = index + 1;
          setIndex(nextIndex);
          onNavigate({ page, index: nextIndex });
          break;
        }
        if (contents?.meta?.has_more_pages && !contentsLoading) {
          clearViewport();
          setPendingBoundary("next");
          setPage((p) => p + 1);
        }
        break;
      case input === "o" && !!block:
        openUrl(`https://www.are.na/block/${block.id}`);
        break;
    }
  });

  if (contentsLoading || blockLoading) {
    return <Spinner label={`Loading block ${currentId ?? ""}`.trim()} />;
  }

  if (contentsError || blockError) {
    const message =
      contentsError?.message ?? blockError?.message ?? "Failed to load block";
    return (
      <Box flexDirection="column">
        <Text color="red">✕ {message}</Text>
        <Text dimColor> Press q to go back</Text>
      </Box>
    );
  }

  if (!block || !contents) return null;

  return (
    <Box flexDirection="column">
      <BlockContent block={block} />
      <Box marginTop={1}>
        <Text dimColor>
          {globalIndex ?? index + 1}/{contents.meta.total_count}
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
