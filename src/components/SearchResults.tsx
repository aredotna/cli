import { useEffect } from "react";
import { Box, Text, useInput } from "ink";
import useSWR from "swr";
import { ArenaError, client, getData } from "../api/client";
import type { Block, Channel } from "../api/types";
import { truncate } from "../lib/format";
import { openUrl } from "../lib/open";
import { usePagedCursorList } from "../hooks/usePagedCursorList";
import { channelColor, INDICATORS } from "../lib/theme";
import { BlockItem } from "./BlockItem";
import { ScreenEmpty, ScreenError } from "./ScreenStates";
import { Spinner } from "./Spinner";

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
  const { page, cursor, clampCursor, moveUp, moveDown, nextPage, prevPage } =
    usePagedCursorList({});

  const {
    data,
    error,
    isLoading: loading,
  } = useSWR(`search/${query}?page=${page}&per=${PER}`, () =>
    getData(
      client.GET("/v3/search", {
        params: { query: { query, page, per: PER } },
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

  useEffect(() => {
    clampCursor(items.length);
  }, [items.length, clampCursor]);

  useInput((char, key) => {
    if (char === "q" || key.escape) return onBack();
    if (loading) return;

    switch (true) {
      case key.upArrow || char === "k":
        moveUp(items.length);
        break;
      case key.downArrow || char === "j":
        moveDown(items.length);
        break;
      case key.return && !!items[cursor]: {
        const item = items[cursor]!;
        if (item.type === "Channel") {
          const channelItem = item as Channel;
          if (channelItem.slug) {
            onNavigate({ kind: "channel", slug: channelItem.slug });
          }
        } else {
          const blockIds = blocks.map((b) => b.id);
          onNavigate({
            kind: "block",
            blockIds,
            index: blockIds.indexOf(item.id),
          });
        }
        break;
      }
      case (key.rightArrow || char === "n") &&
        !!data &&
        page < data.meta.total_pages:
        nextPage();
        break;
      case (key.leftArrow || char === "p") && page > 1:
        prevPage();
        break;
      case char === "o" && !!items[cursor]: {
        const item = items[cursor]!;
        if (item.type === "Channel") {
          const ch = item as Channel;
          openUrl(
            `https://www.are.na/${ch.owner?.slug || ""}/${ch.slug || ""}`,
          );
        } else {
          openUrl(`https://www.are.na/block/${item.id}`);
        }
        break;
      }
    }
  });

  if (loading) return <Spinner label={`Searching "${query}"`} />;

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
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="green">
          **
        </Text>
        <Text bold> Are.na</Text>
        <Text dimColor> · search · </Text>
        <Text>{query}</Text>
      </Box>

      <Box flexDirection="column">
        {channels.length > 0 && (
          <>
            <Text dimColor> Channels</Text>
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
          </>
        )}

        {blocks.length > 0 && (
          <>
            {channels.length > 0 && <Text> </Text>}
            <Text dimColor> Blocks</Text>
            {blocks.map((block, i) => {
              const idx = channels.length + i;
              return (
                <BlockItem
                  key={block.id}
                  item={block}
                  selected={idx === cursor}
                />
              );
            })}
          </>
        )}
      </Box>

      {data && (
        <Box marginTop={1}>
          <Text dimColor>
            Page {page}/{data.meta.total_pages} · ↑↓/j/k wrap · ↵ open · ←→/n/p
            page · o browser · q/esc back
          </Text>
        </Box>
      )}
    </Box>
  );
}
