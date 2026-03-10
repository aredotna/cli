import { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import useSWR from "swr";
import { client, getData } from "../api/client";
import type { Block, Channel, ChannelRef } from "../api/types";
import { plural, truncate } from "../lib/format";
import { openUrl } from "../lib/open";
import { orderedBlockIndexByCursor, wrapIndex } from "../lib/session-nav";
import { channelColor, INDICATORS } from "../lib/theme";
import { BlockItem } from "./BlockItem";
import { Spinner } from "./Spinner";

type ContentNavigateView =
  | { kind: "channel"; slug: string }
  | { kind: "block"; blockIds: number[]; index: number };

export function UserContentsScreen({
  slug,
  onNavigate,
  onBack,
}: {
  slug: string;
  onNavigate: (view: ContentNavigateView) => void;
  onBack: () => void;
}) {
  const PER = 24;
  const [page, setPage] = useState(1);
  const [cursor, setCursor] = useState(0);

  const {
    data,
    error,
    isLoading: loading,
  } = useSWR(`session-user-contents:${slug}:${page}:${PER}`, () =>
    Promise.all([
      getData(client.GET("/v3/users/{id}", { params: { path: { id: slug } } })),
      getData(
        client.GET("/v3/users/{id}/contents", {
          params: { path: { id: slug }, query: { page, per: PER } },
        }),
      ),
    ]).then(([user, contents]) => ({ user, contents })),
  );

  const items = data?.contents.data ?? [];
  const blocks = items.filter((item) => item.type !== "Channel") as Block[];
  const blockIds = useMemo(() => blocks.map((block) => block.id), [blocks]);
  const meta = data?.contents.meta;

  useEffect(() => {
    if (cursor >= items.length && items.length > 0) {
      setCursor(items.length - 1);
    }
  }, [items.length, cursor]);

  useInput((char, key) => {
    if (char === "q" || key.escape) return onBack();
    if (loading || !data) return;

    switch (true) {
      case key.upArrow || char === "k":
        setCursor((value) => wrapIndex(value, items.length, -1));
        break;
      case key.downArrow || char === "j":
        setCursor((value) => wrapIndex(value, items.length, 1));
        break;
      case key.return && !!items[cursor]: {
        const item = items[cursor]!;
        if (item.type === "Channel" && "slug" in item) {
          onNavigate({ kind: "channel", slug: (item as ChannelRef).slug });
          break;
        }
        const index = orderedBlockIndexByCursor(items, cursor);
        if (index >= 0) {
          onNavigate({ kind: "block", blockIds, index });
        }
        break;
      }
      case (key.rightArrow || char === "n") &&
        !!meta &&
        page < meta.total_pages:
        setPage((value) => value + 1);
        setCursor(0);
        break;
      case (key.leftArrow || char === "p") && page > 1:
        setPage((value) => value - 1);
        setCursor(0);
        break;
      case char === "o" && !!items[cursor]: {
        const item = items[cursor]!;
        if (item.type === "Channel" && "slug" in item) {
          const ch = item as ChannelRef;
          openUrl(`https://www.are.na/${ch.owner?.slug || ""}/${ch.slug}`);
        } else {
          openUrl(`https://www.are.na/block/${item.id}`);
        }
        break;
      }
    }
  });

  if (loading) return <Spinner label={`Loading contents for ${slug}`} />;

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">✕ {error.message}</Text>
        <Text dimColor>q back</Text>
      </Box>
    );
  }

  if (!data) {
    return (
      <Box flexDirection="column">
        <Text dimColor>Contents unavailable</Text>
        <Text dimColor>q back</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>{data.user.name}</Text>
        <Text dimColor>@{data.user.slug} · contents</Text>
      </Box>

      {items.length === 0 ? (
        <Text dimColor>No contents found</Text>
      ) : (
        <Box flexDirection="column">
          {items.map((item, idx) =>
            item.type === "Channel" ? (
              <Box key={`${item.type}-${item.id}-${idx}`}>
                <Text color={idx === cursor ? "cyan" : undefined}>
                  {idx === cursor ? "▸ " : "  "}
                </Text>
                <Text
                  color={channelColor((item as Channel).visibility)}
                  bold={idx === cursor}
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
                selected={idx === cursor}
              />
            ),
          )}
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>
          Page {page}/{meta?.total_pages ?? 1} ·{" "}
          {plural(meta?.total_count ?? items.length, "item")} · ↑↓ wrap · ↵ open
          · ←→/n/p page · o browser · q/esc back
        </Text>
      </Box>
    </Box>
  );
}
