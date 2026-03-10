import { useEffect } from "react";
import { Box, Text, useInput } from "ink";
import useSWR from "swr";
import type { Block, Channel, ChannelRef } from "../api/types";
import { plural, truncate } from "../lib/format";
import { openUrl } from "../lib/open";
import { orderedBlockIndexByCursor } from "../lib/session-nav";
import { channelColor, INDICATORS } from "../lib/theme";
import { usePagedCursorList } from "../hooks/usePagedCursorList";
import { BlockItem } from "./BlockItem";
import { ScreenEmpty, ScreenError, ScreenUnavailable } from "./ScreenStates";
import { Spinner } from "./Spinner";

type ContentsNavigateView =
  | { kind: "channel"; slug: string }
  | { kind: "block"; blockIds: number[]; index: number };

interface ContentsPageResult {
  name: string;
  slug: string;
  items: Array<Channel | Block>;
  meta?: {
    total_pages: number;
    total_count: number;
  };
}

export function SessionContentsListScreen({
  slug,
  swrKeyPrefix,
  loadingLabel,
  unavailableLabel,
  fetchPage,
  onNavigate,
  onBack,
}: {
  slug: string;
  swrKeyPrefix: string;
  loadingLabel: string;
  unavailableLabel: string;
  fetchPage: (args: {
    slug: string;
    page: number;
    per: number;
  }) => Promise<ContentsPageResult>;
  onNavigate: (view: ContentsNavigateView) => void;
  onBack: () => void;
}) {
  const PER = 24;
  const pagedCursor = usePagedCursorList({});

  const {
    data,
    error,
    isLoading: loading,
  } = useSWR(`${swrKeyPrefix}:${slug}:${pagedCursor.page}:${PER}`, () =>
    fetchPage({ slug, page: pagedCursor.page, per: PER }),
  );

  const items = data?.items ?? [];
  const blocks = items.filter((item) => item.type !== "Channel") as Block[];
  const blockIds = blocks.map((block) => block.id);
  const meta = data?.meta;

  useEffect(() => {
    pagedCursor.clampCursor(items.length);
  }, [items.length, pagedCursor.clampCursor]);

  useInput((char, key) => {
    if (char === "q" || key.escape) return onBack();
    if (loading || !data) return;

    switch (true) {
      case key.upArrow || char === "k":
        pagedCursor.moveUp(items.length);
        break;
      case key.downArrow || char === "j":
        pagedCursor.moveDown(items.length);
        break;
      case key.return && !!items[pagedCursor.cursor]: {
        const item = items[pagedCursor.cursor]!;
        if (item.type === "Channel" && "slug" in item) {
          onNavigate({ kind: "channel", slug: (item as ChannelRef).slug });
          break;
        }
        const index = orderedBlockIndexByCursor(items, pagedCursor.cursor);
        if (index >= 0) {
          onNavigate({ kind: "block", blockIds, index });
        }
        break;
      }
      case (key.rightArrow || char === "n") &&
        !!meta &&
        pagedCursor.page < meta.total_pages:
        pagedCursor.nextPage();
        break;
      case (key.leftArrow || char === "p") && pagedCursor.page > 1:
        pagedCursor.prevPage();
        break;
      case char === "o" && !!items[pagedCursor.cursor]: {
        const item = items[pagedCursor.cursor]!;
        if (item.type === "Channel" && "slug" in item) {
          const channel = item as ChannelRef;
          openUrl(
            `https://www.are.na/${channel.owner?.slug || ""}/${channel.slug}`,
          );
        } else {
          openUrl(`https://www.are.na/block/${item.id}`);
        }
        break;
      }
    }
  });

  if (loading) return <Spinner label={loadingLabel} />;
  if (error)
    return <ScreenError message={error.message} backHint="q/esc back" />;
  if (!data)
    return (
      <ScreenUnavailable message={unavailableLabel} backHint="q/esc back" />
    );
  if (items.length === 0)
    return <ScreenEmpty message="No contents found" backHint="q/esc back" />;

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>{data.name}</Text>
        <Text dimColor>@{data.slug} · contents</Text>
      </Box>

      <Box flexDirection="column">
        {items.map((item, idx) =>
          item.type === "Channel" ? (
            <Box key={`${item.type}-${item.id}-${idx}`}>
              <Text color={idx === pagedCursor.cursor ? "cyan" : undefined}>
                {idx === pagedCursor.cursor ? "▸ " : "  "}
              </Text>
              <Text
                color={channelColor((item as Channel).visibility)}
                bold={idx === pagedCursor.cursor}
              >
                {INDICATORS.Channel}{" "}
                {truncate((item as Channel).title ?? "Untitled", 50)}
              </Text>
              <Text dimColor>
                {" "}
                · {(item as Channel).visibility} ·{" "}
                {(item as Channel).counts.contents}
              </Text>
            </Box>
          ) : (
            <BlockItem
              key={`${item.type}-${item.id}-${idx}`}
              item={item as Block}
              selected={idx === pagedCursor.cursor}
            />
          ),
        )}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          Page {pagedCursor.page}/{meta?.total_pages ?? 1} ·{" "}
          {plural(meta?.total_count ?? items.length, "item")} · ↑↓/j/k wrap · ↵
          open · ←→/n/p page · o browser · q/esc back
        </Text>
      </Box>
    </Box>
  );
}
