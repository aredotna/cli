import { Box, Text } from "ink";
import useSWR from "swr";
import type { Block, Channel, ChannelRef } from "../api/types";
import { truncate } from "../lib/format";
import { openUrl } from "../lib/open";
import { orderedBlockIndexByCursor } from "../lib/session-nav";
import { channelColor, INDICATORS } from "../lib/theme";
import { usePagedCursorList } from "../hooks/usePagedCursorList";
import { useSessionListNavigation } from "../hooks/useSessionListNavigation";
import { BlockItem } from "./BlockItem";
import { useSessionPaletteActive } from "./SessionPaletteContext";
import { Panel, ScreenFrame } from "./ScreenChrome";
import {
  ScreenEmpty,
  ScreenError,
  ScreenLoading,
  ScreenUnavailable,
} from "./ScreenStates";

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
  const paletteActive = useSessionPaletteActive();

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

  const list = useSessionListNavigation({
    state: {
      page: pagedCursor.page,
      cursor: pagedCursor.cursor,
    },
    handlers: pagedCursor,
    itemCount: items.length,
    loading: loading || !data,
    paletteActive,
    canNextPage: ({ page }) => !!meta && page < meta.total_pages,
    onOpen: (selectedIndex) => {
      const item = items[selectedIndex];
      if (!item) return;
      if (item.type === "Channel" && "slug" in item) {
        onNavigate({ kind: "channel", slug: (item as ChannelRef).slug });
        return;
      }
      const index = orderedBlockIndexByCursor(items, selectedIndex);
      if (index >= 0) {
        onNavigate({ kind: "block", blockIds, index });
      }
    },
    onBack,
    onOpenBrowser: (selectedIndex) => {
      const item = items[selectedIndex];
      if (!item) return;
      if (item.type === "Channel" && "slug" in item) {
        const channel = item as ChannelRef;
        openUrl(
          `https://www.are.na/${channel.owner?.slug || ""}/${channel.slug}`,
        );
        return;
      }
      openUrl(`https://www.are.na/block/${item.id}`);
    },
  });

  if (loading) return <ScreenLoading label={loadingLabel} />;
  if (error) return <ScreenError message={error.message} />;
  if (!data) return <ScreenUnavailable message={unavailableLabel} />;
  if (items.length === 0) return <ScreenEmpty message="No contents found" />;

  return (
    <ScreenFrame title={`${data.name} / contents`}>
      <Panel>
        <Box flexDirection="column">
          {items.map((item, idx) =>
            item.type === "Channel" ? (
              <Box key={`${item.type}-${item.id}`}>
                <Text color={idx === list.state.cursor ? "cyan" : undefined}>
                  {idx === list.state.cursor ? "▸ " : "  "}
                </Text>
                <Text
                  color={channelColor((item as Channel).visibility)}
                  bold={idx === list.state.cursor}
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
                key={`${item.type}-${item.id}`}
                item={item as Block}
                selected={idx === list.state.cursor}
              />
            ),
          )}
        </Box>
      </Panel>
    </ScreenFrame>
  );
}
