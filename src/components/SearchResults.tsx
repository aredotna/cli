import { Box, Text } from "ink";
import useSWR from "swr";
import { ArenaError, client, getData } from "../api/client";
import type { Block, Channel } from "../api/types";
import { truncate } from "../lib/format";
import { openUrl } from "../lib/open";
import { usePagedCursorList } from "../hooks/usePagedCursorList";
import { useSessionListNavigation } from "../hooks/useSessionListNavigation";
import { channelColor, INDICATORS } from "../lib/theme";
import { BlockItem } from "./BlockItem";
import { useSessionPaletteActive } from "./SessionPaletteContext";
import { Panel, ScreenFrame } from "./ScreenChrome";
import { ScreenEmpty, ScreenError, ScreenLoading } from "./ScreenStates";

type SearchNavigateView =
  | { kind: "channel"; slug: string }
  | { kind: "block"; blockIds: number[]; index: number };

export function SearchResults({
  query,
  onNavigate,
  onBack,
}: {
  query: string;
  onNavigate: (view: SearchNavigateView) => void;
  onBack: () => void;
}) {
  const PER = 20;
  const paletteActive = useSessionPaletteActive();
  const pagedCursor = usePagedCursorList({});

  const {
    data,
    error,
    isLoading: loading,
  } = useSWR(`search/${query}?page=${pagedCursor.page}&per=${PER}`, () =>
    getData(
      client.GET("/v3/search", {
        params: { query: { query, page: pagedCursor.page, per: PER } },
      }),
    ).then((r) => {
      const channels = r.data.filter((i) => i.type === "Channel") as Channel[];
      const blocks = r.data.filter(
        (i) => i.type !== "Channel" && i.type !== "User",
      ) as Block[];
      return {
        channels,
        blocks,
        items: [...channels, ...blocks],
        meta: r.meta,
      };
    }),
  );

  const items = data?.items ?? [];
  const channels = data?.channels ?? [];
  const blocks = data?.blocks ?? [];

  const list = useSessionListNavigation({
    state: {
      page: pagedCursor.page,
      cursor: pagedCursor.cursor,
    },
    handlers: pagedCursor,
    itemCount: items.length,
    loading,
    paletteActive,
    canNextPage: ({ page }) => !!data && page < data.meta.total_pages,
    onOpen: (selectedIndex) => {
      const item = items[selectedIndex];
      if (!item) return;
      if (item.type === "Channel") {
        const channel = item as Channel;
        if (channel.slug) {
          onNavigate({ kind: "channel", slug: channel.slug });
        }
        return;
      }
      const blockIds = blocks.map((block) => block.id);
      const index = blockIds.indexOf(item.id);
      if (index >= 0) {
        onNavigate({
          kind: "block",
          blockIds,
          index,
        });
      }
    },
    onBack,
    onOpenBrowser: (selectedIndex) => {
      const item = items[selectedIndex];
      if (!item) return;
      if (item.type === "Channel") {
        const channel = item as Channel;
        openUrl(
          `https://www.are.na/${channel.owner?.slug || ""}/${channel.slug || ""}`,
        );
        return;
      }
      openUrl(`https://www.are.na/block/${item.id}`);
    },
  });

  if (loading) return <ScreenLoading label={`Searching "${query}"`} />;

  if (error) {
    const isPermission = error instanceof ArenaError && error.status === 403;
    const message = isPermission
      ? "Search requires Are.na Premium"
      : error.message;
    return <ScreenError message={message} />;
  }

  if (items.length === 0) {
    return <ScreenEmpty message={`No results for "${query}"`} />;
  }

  return (
    <ScreenFrame title={`Search / ${query}`}>
      <Panel>
        <Box flexDirection="column">
          {channels.length > 0 && (
            <>
              <Text dimColor>Channels</Text>
              {channels.map((ch, i) => (
                <Box key={ch.slug || String(ch.id)}>
                  <Text color={i === list.state.cursor ? "cyan" : undefined}>
                    {i === list.state.cursor ? "▸ " : "  "}
                  </Text>
                  <Text
                    color={channelColor(ch.visibility)}
                    bold={i === list.state.cursor}
                  >
                    {INDICATORS.Channel} {truncate(ch.title ?? "Untitled", 50)}
                  </Text>
                  <Text dimColor>
                    {" "}
                    · {ch.visibility} · {ch.counts.contents}
                  </Text>
                </Box>
              ))}
            </>
          )}

          {blocks.length > 0 && (
            <>
              {channels.length > 0 && <Text> </Text>}
              <Text dimColor>Blocks</Text>
              {blocks.map((block, i) => {
                const idx = channels.length + i;
                return (
                  <BlockItem
                    key={block.id}
                    item={block}
                    selected={idx === list.state.cursor}
                  />
                );
              })}
            </>
          )}
        </Box>
      </Panel>
    </ScreenFrame>
  );
}
