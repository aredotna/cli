import { useEffect } from "react";
import { Box, Text, useInput } from "ink";
import useSWR from "swr";
import { client, getData } from "../api/client";
import type { Channel, User } from "../api/types";
import { truncate } from "../lib/format";
import { openUrl } from "../lib/open";
import { usePagedCursorList } from "../hooks/usePagedCursorList";
import { channelColor, INDICATORS } from "../lib/theme";
import { ScreenEmpty, ScreenError } from "./ScreenStates";
import { Spinner } from "./Spinner";

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
  const { page, cursor, clampCursor, moveUp, moveDown, nextPage, prevPage } =
    usePagedCursorList({});

  const {
    data,
    error,
    isLoading: loading,
  } = useSWR(`user/${me.slug}/channels?page=${page}&per=${PER}`, () =>
    getData(
      client.GET("/v3/users/{id}/contents", {
        params: {
          path: { id: me.slug },
          query: { page, per: PER, type: "Channel" },
        },
      }),
    ),
  );

  const channels =
    data?.data.filter((item): item is Channel => item.type === "Channel") ?? [];
  const meta = data?.meta;

  useEffect(() => {
    clampCursor(channels.length);
  }, [channels.length, clampCursor]);

  useInput((char, key) => {
    if (char === "q" || key.escape) return onBack();
    if (loading) return;

    switch (true) {
      case key.upArrow || char === "k":
        moveUp(channels.length);
        break;
      case key.downArrow || char === "j":
        moveDown(channels.length);
        break;
      case key.return && !!channels[cursor]:
        if (channels[cursor]!.slug) {
          onNavigate({ kind: "channel", slug: channels[cursor]!.slug });
        }
        break;
      case (key.rightArrow || char === "n") &&
        !!meta &&
        page < meta.total_pages:
        nextPage();
        break;
      case (key.leftArrow || char === "p") && page > 1:
        prevPage();
        break;
      case char === "o" && !!channels[cursor]: {
        const ch = channels[cursor]!;
        openUrl(`https://www.are.na/${ch.owner?.slug || ""}/${ch.slug || ""}`);
        break;
      }
    }
  });

  if (loading) return <Spinner label="Loading channels" />;

  if (error) {
    return <ScreenError message={error.message} />;
  }

  if (channels.length === 0) {
    return <ScreenEmpty message="No channels found" />;
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="green">
          **
        </Text>
        <Text bold> Are.na</Text>
        <Text dimColor> · channels · {me.name}</Text>
      </Box>

      <Box flexDirection="column">
        {channels.map((ch, i) => (
          <Box key={ch.slug || String(ch.id)}>
            <Text color={i === cursor ? "cyan" : undefined}>
              {i === cursor ? "▸ " : "  "}
            </Text>
            <Text color={channelColor(ch.visibility)} bold={i === cursor}>
              {INDICATORS.Channel} {truncate(ch.title ?? "Untitled", 50)}
            </Text>
            <Text dimColor>
              {" "}
              · {ch.visibility} · {ch.counts.contents}
            </Text>
          </Box>
        ))}
      </Box>

      {meta && (
        <Box marginTop={1}>
          <Text dimColor>
            Page {page}/{meta.total_pages} · ↑↓/j/k wrap · ↵ open · ←→/n/p page
            · o browser · q/esc back
          </Text>
        </Box>
      )}
    </Box>
  );
}
