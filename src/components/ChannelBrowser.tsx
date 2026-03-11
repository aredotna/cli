import { useEffect, useReducer, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import useSWR from "swr";
import { client, getData } from "../api/client";
import type { ChannelRef } from "../api/types";
import { plural } from "../lib/format";
import { openUrl } from "../lib/open";
import { orderedBlockIndexByCursor, wrapIndex } from "../lib/session-nav";
import { visibilityLabel } from "../lib/theme";
import { addComposerReducer, INITIAL_ADD_COMPOSER_STATE } from "./AddComposer";
import { BlockItem } from "./BlockItem";
import { useSessionFooter } from "./SessionFooterContext";
import { useSessionPaletteActive } from "./SessionPaletteContext";
import { Panel, ScreenFrame } from "./ScreenChrome";
import { ScreenError, ScreenLoading, ScreenUnavailable } from "./ScreenStates";

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
  const initialStateRef = useRef({ page: initialPage, cursor: initialCursor });
  const [page, setPage] = useState(initialStateRef.current.page);
  const [cursor, setCursor] = useState(initialStateRef.current.cursor);
  const [showComposerCursor, dispatchComposerCursor] = useReducer(
    (value: boolean, action: "reset" | "toggle") =>
      action === "reset" ? true : !value,
    true,
  );
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [addComposer, dispatchAddComposer] = useReducer(
    addComposerReducer,
    INITIAL_ADD_COMPOSER_STATE,
  );
  const paletteActive = useSessionPaletteActive();

  useSessionFooter(
    addComposer.isOpen
      ? [
          { key: "type", label: "compose" },
          { key: "↵", label: "submit" },
          { key: "esc", label: "cancel" },
        ]
      : [],
  );

  useEffect(() => {
    if (!addComposer.isOpen) {
      dispatchComposerCursor("reset");
      return;
    }
    const intervalId = setInterval(() => {
      dispatchComposerCursor("toggle");
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
    if (paletteActive) return;
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
        setCursor((c) => wrapIndex(c, items.length, -1));
        break;
      case key.downArrow || input === "j":
        setCursor((c) => wrapIndex(c, items.length, 1));
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
            index: orderedBlockIndexByCursor(items, cursor),
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

  if (loading) return <ScreenLoading label={`Loading ${slug}`} />;

  if (error) return <ScreenError message={error.message} />;

  if (!data) return <ScreenUnavailable message="Channel unavailable" />;

  const { channel } = data;

  return (
    <ScreenFrame title={channel.title}>
      <Box flexDirection="column" gap={1}>
        {addComposer.isOpen ? (
          <Panel title="Add block">
            <Box flexDirection="column">
              <Text>
                +{" "}
                <Text color="cyan">
                  {addComposer.value}
                  {showComposerCursor ? "█" : " "}
                </Text>
              </Text>
              {addComposer.isSubmitting && <Text dimColor>submitting...</Text>}
              {addComposer.error && (
                <Text color="red">✕ {addComposer.error}</Text>
              )}
            </Box>
          </Panel>
        ) : null}

        <Panel>
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
        </Panel>

        {addComposer.message && (
          <Text color="green">✓ {addComposer.message}</Text>
        )}
        {refreshMessage && <Text color="green">✓ {refreshMessage}</Text>}
      </Box>
    </ScreenFrame>
  );
}
