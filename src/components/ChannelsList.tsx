import { Box, Text } from "ink";
import useSWR from "swr";
import { client, getData } from "../api/client";
import type { Channel, User } from "../api/types";
import { truncate } from "../lib/format";
import { openUrl } from "../lib/open";
import { usePagedCursorList } from "../hooks/usePagedCursorList";
import { useSessionListNavigation } from "../hooks/useSessionListNavigation";
import { channelColor, INDICATORS } from "../lib/theme";
import { useSessionPaletteActive } from "./SessionPaletteContext";
import { ScreenEmpty, ScreenError, ScreenLoading } from "./ScreenStates";
import { Panel, ScreenFrame } from "./ScreenChrome";

type ChannelsNavigateView = { kind: "channel"; slug: string };

export function ChannelsList({
  me,
  onNavigate,
  onBack,
}: {
  me: User;
  onNavigate: (view: ChannelsNavigateView) => void;
  onBack: () => void;
}) {
  const PER = 24;
  const paletteActive = useSessionPaletteActive();
  const pagedCursor = usePagedCursorList({});

  const {
    data,
    error,
    isLoading: loading,
  } = useSWR(
    `user/${me.slug}/channels?page=${pagedCursor.page}&per=${PER}`,
    () =>
      getData(
        client.GET("/v3/users/{id}/contents", {
          params: {
            path: { id: me.slug },
            query: { page: pagedCursor.page, per: PER, type: "Channel" },
          },
        }),
      ),
  );

  const channels =
    data?.data.filter((item): item is Channel => item.type === "Channel") ?? [];
  const meta = data?.meta;

  const list = useSessionListNavigation({
    state: {
      page: pagedCursor.page,
      cursor: pagedCursor.cursor,
    },
    handlers: pagedCursor,
    itemCount: channels.length,
    loading,
    paletteActive,
    canNextPage: ({ page }) => !!meta && page < meta.total_pages,
    onOpen: (selectedIndex) => {
      const selected = channels[selectedIndex];
      if (selected?.slug) {
        onNavigate({ kind: "channel", slug: selected.slug });
      }
    },
    onBack,
    onOpenBrowser: (selectedIndex) => {
      const selected = channels[selectedIndex];
      if (!selected) return;
      openUrl(
        `https://www.are.na/${selected.owner?.slug || ""}/${selected.slug || ""}`,
      );
    },
  });

  if (loading) return <ScreenLoading label="Loading channels" />;

  if (error) {
    return <ScreenError message={error.message} />;
  }

  if (channels.length === 0) {
    return <ScreenEmpty message="No channels found" />;
  }

  return (
    <ScreenFrame title="Your channels">
      <Panel>
        <Box flexDirection="column">
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
        </Box>
      </Panel>
    </ScreenFrame>
  );
}
