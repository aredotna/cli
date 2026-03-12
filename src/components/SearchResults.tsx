import { Box, Text } from "ink";
import useSWR from "swr";
import { ArenaError, client, getData } from "../api/client";
import type {
  Block,
  Channel,
  Connectable,
  Group,
  SearchResult,
  User,
} from "../api/types";
import { openUrl } from "../lib/open";
import { usePagedCursorList } from "../hooks/usePagedCursorList";
import { useSessionListNavigation } from "../hooks/useSessionListNavigation";
import { accentColor, mutedColor } from "../lib/theme";
import { BlockItem } from "./BlockItem";
import { useSessionPaletteActive } from "./SessionPaletteContext";
import { Panel, ScreenFrame } from "./ScreenChrome";
import { ScreenEmpty, ScreenError, ScreenLoading } from "./ScreenStates";

type SearchNavigateView =
  | { kind: "channel"; slug: string }
  | { kind: "block"; blockIds: number[]; index: number }
  | { kind: "userProfile"; slug: string }
  | { kind: "groupProfile"; slug: string };

function isChannel(item: SearchResult): item is Channel {
  return item.type === "Channel";
}

function isUser(item: SearchResult): item is User {
  return item.type === "User";
}

function isGroup(item: SearchResult): item is Group {
  return item.type === "Group";
}

function isBlock(item: SearchResult): item is Block {
  return !isChannel(item) && !isUser(item) && !isGroup(item);
}

function isConnectable(item: SearchResult): item is Connectable {
  return isChannel(item) || isBlock(item);
}

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
    ),
  );

  const items = (data?.data ?? []) as SearchResult[];

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
      if (isChannel(item)) {
        if (item.slug) onNavigate({ kind: "channel", slug: item.slug });
        return;
      }
      if (isUser(item)) {
        if (item.slug) onNavigate({ kind: "userProfile", slug: item.slug });
        return;
      }
      if (isGroup(item)) {
        if (item.slug) onNavigate({ kind: "groupProfile", slug: item.slug });
        return;
      }

      const blockIds = items.filter(isBlock).map((block) => block.id);
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
      if (isChannel(item)) {
        openUrl(
          `https://www.are.na/${item.owner?.slug || ""}/${item.slug || ""}`,
        );
        return;
      }
      if (isUser(item)) {
        openUrl(`https://www.are.na/${item.slug || ""}`);
        return;
      }
      if (isGroup(item)) {
        openUrl(`https://www.are.na/group/${item.slug || ""}`);
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
          {items.map((item, i) => {
            if (isConnectable(item)) {
              return (
                <BlockItem
                  key={`${item.type}-${item.id}`}
                  item={item}
                  selected={i === list.state.cursor}
                />
              );
            }

            if (isUser(item)) {
              return (
                <Box key={`user-${item.id}`}>
                  <Text color={i === list.state.cursor ? "cyan" : undefined}>
                    {i === list.state.cursor ? "▸ " : "  "}
                  </Text>
                  <Text color={accentColor()} bold={i === list.state.cursor}>
                    @{item.slug}
                  </Text>
                  <Text color={mutedColor()}> · {item.name}</Text>
                </Box>
              );
            }

            return (
              <Box key={`group-${item.id}`}>
                <Text color={i === list.state.cursor ? "cyan" : undefined}>
                  {i === list.state.cursor ? "▸ " : "  "}
                </Text>
                <Text color={accentColor()} bold={i === list.state.cursor}>
                  {item.name}
                </Text>
                <Text color={mutedColor()}> · group/{item.slug}</Text>
              </Box>
            );
          })}
        </Box>
      </Panel>
    </ScreenFrame>
  );
}
