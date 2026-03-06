import { useEffect, useReducer, useState } from "react";
import { Box, Text, useInput } from "ink";
import useSWR from "swr";
import { client, getData } from "../api/client";
import type { ChannelRef } from "../api/types";
import { plural } from "../lib/format";
import { openUrl } from "../lib/open";
import { visibilityLabel } from "../lib/theme";
import { addComposerReducer, INITIAL_ADD_COMPOSER_STATE } from "./AddComposer";
import { BlockItem } from "./BlockItem";
import { Spinner } from "./Spinner";

export type ChannelNavItem =
  | { kind: "channel"; slug: string; page: number; cursor: number }
  | { kind: "block"; slug: string; page: number; index: number };

export function ChannelBrowser({
  slug,
  initialPage = 1,
  initialCursor = 0,
  per,
  onNavigate,
  onBack,
}: {
  slug: string;
  initialPage?: number;
  initialCursor?: number;
  per: number;
  onNavigate: (item: ChannelNavItem) => void;
  onBack: () => void;
}) {
  const [page, setPage] = useState(initialPage);
  const [cursor, setCursor] = useState(initialCursor);
  const [showComposerCursor, setShowComposerCursor] = useState(true);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [addComposer, dispatchAddComposer] = useReducer(
    addComposerReducer,
    INITIAL_ADD_COMPOSER_STATE,
  );

  useEffect(() => {
    if (!addComposer.isOpen) {
      setShowComposerCursor(true);
      return;
    }
    const intervalId = setInterval(() => {
      setShowComposerCursor((value) => !value);
    }, 500);
    return () => clearInterval(intervalId);
  }, [addComposer.isOpen]);

  useEffect(() => {
    if (!refreshMessage) return;
    const timeoutId = setTimeout(() => setRefreshMessage(null), 1200);
    return () => clearTimeout(timeoutId);
  }, [refreshMessage]);

  const {
    data,
    error,
    isLoading: loading,
    mutate,
  } = useSWR(`channel/${slug}?page=${page}&per=${per}`, () =>
    Promise.all([
      getData(
        client.GET("/v3/channels/{id}", { params: { path: { id: slug } } }),
      ),
      getData(
        client.GET("/v3/channels/{id}/contents", {
          params: {
            path: { id: slug },
            query: { page, per, sort: "position_desc" },
          },
        }),
      ),
    ]).then(([channel, contents]) => ({ channel, contents })),
  );

  const items = data?.contents.data ?? [];
  const meta = data?.contents.meta;

  useInput((input, key) => {
    if (addComposer.isOpen) {
      if (key.escape) {
        dispatchAddComposer({ type: "cancel" });
        return;
      }
      if (key.backspace || key.delete) {
        dispatchAddComposer({ type: "backspace" });
        return;
      }
      if (key.return) {
        const value = addComposer.value.trim();
        if (!value) {
          dispatchAddComposer({ type: "setError", error: "Value is required" });
          return;
        }
        if (addComposer.isSubmitting || !data) return;
        dispatchAddComposer({ type: "setSubmitting", value: true });
        void getData(
          client.POST("/v3/blocks", {
            body: {
              value,
              channel_ids: [data.channel.id],
            },
          }),
        )
          .then(() => {
            dispatchAddComposer({ type: "cancel" });
            dispatchAddComposer({ type: "setMessage", message: "Added block" });
            void mutate();
          })
          .catch((err: unknown) => {
            dispatchAddComposer({
              type: "setError",
              error: err instanceof Error ? err.message : String(err),
            });
          })
          .finally(() => {
            dispatchAddComposer({ type: "setSubmitting", value: false });
          });
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        dispatchAddComposer({ type: "append", input });
      }
      return;
    }

    if (input === "q" || key.escape) return onBack();
    if (loading || !data) return;

    switch (true) {
      case key.upArrow || input === "k":
        setCursor((c) => Math.max(0, c - 1));
        break;
      case key.downArrow || input === "j":
        setCursor((c) => Math.min(items.length - 1, c + 1));
        break;
      case key.return: {
        const item = items[cursor];
        if (!item) break;
        if (item.type === "Channel" && "slug" in item) {
          onNavigate({
            kind: "channel",
            slug: (item as ChannelRef).slug,
            page: 1,
            cursor: 0,
          });
        } else {
          const blockIds = items
            .filter((i) => i.type !== "Channel")
            .map((i) => i.id);
          onNavigate({
            kind: "block",
            slug,
            page,
            index: blockIds.indexOf(item.id),
          });
        }
        break;
      }
      case (input === "n" || key.rightArrow) && !!meta?.has_more_pages:
        setPage((p) => p + 1);
        setCursor(0);
        break;
      case (input === "p" || key.leftArrow) && page > 1:
        setPage((p) => p - 1);
        setCursor(0);
        break;
      case input === "o": {
        const item = items[cursor];
        if (!item) break;
        if (item.type === "Channel" && "slug" in item) {
          const ch = item as ChannelRef;
          openUrl(`https://www.are.na/${ch.owner?.slug || ""}/${ch.slug}`);
        } else {
          openUrl(`https://www.are.na/block/${item.id}`);
        }
        break;
      }
      case input === "r":
        setRefreshMessage("Refreshed");
        void mutate();
        break;
      case input === "a":
        dispatchAddComposer({ type: "open" });
        break;
    }
  });

  if (loading) return <Spinner label={`Loading ${slug}`} />;

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">✕ {error.message}</Text>
        <Text dimColor> Press q to go back</Text>
      </Box>
    );
  }

  if (!data) return null;

  const { channel } = data;

  return (
    <Box flexDirection="column">
      <Box flexDirection="column" marginBottom={1}>
        <Text bold>{channel.title}</Text>
        <Text dimColor>
          {channel.owner.name} · {visibilityLabel(channel.visibility)} ·{" "}
          {plural(channel.counts.contents, "block")}
        </Text>
      </Box>

      {addComposer.isOpen && (
        <Box flexDirection="column" marginBottom={1}>
          <Text>
            +{" "}
            <Text color="cyan">
              {addComposer.value}
              {showComposerCursor ? "█" : " "}
            </Text>
          </Text>
          {addComposer.isSubmitting && <Text dimColor>submitting...</Text>}
          {addComposer.error && <Text color="red">✕ {addComposer.error}</Text>}
        </Box>
      )}

      {items.length === 0 ? (
        <Text dimColor>This channel is empty</Text>
      ) : (
        <Box flexDirection="column">
          {items.map((item, i) => (
            <BlockItem
              key={`${item.type}-${item.id}`}
              item={item}
              selected={i === cursor}
            />
          ))}
        </Box>
      )}

      <Box marginTop={1} flexDirection="column">
        {addComposer.message && (
          <Text color="green">✓ {addComposer.message}</Text>
        )}
        {refreshMessage && <Text color="green">✓ {refreshMessage}</Text>}
        {meta && meta.total_pages > 1 && (
          <Text dimColor>
            Page {meta.current_page}/{meta.total_pages} ·{" "}
            {plural(meta.total_count, "block")}
          </Text>
        )}
        <Text dimColor>
          {addComposer.isOpen
            ? "type text · ↵ submit · esc cancel"
            : "↑↓ navigate · ↵ open · ←→ page · a add · r refresh · o browser · q back"}
        </Text>
      </Box>
    </Box>
  );
}
