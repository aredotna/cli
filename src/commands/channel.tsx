import { useState, useCallback, useRef, useReducer, useEffect } from "react";
import { Box, Text, useApp, useInput } from "ink";
import useSWR from "swr";
import { client, getData } from "../api/client";
import type { Block, ChannelRef, Connectable, Visibility } from "../api/types";
import { BlockContent } from "../components/BlockContent";
import { BlockItem } from "../components/BlockItem";
import { Spinner } from "../components/Spinner";
import { useCommand } from "../hooks/use-command";
import { plural, timeAgo } from "../lib/format";
import { openUrl } from "../lib/open";
import { visibilityLabel } from "../lib/theme";

type NavItem =
  | { kind: "channel"; slug: string }
  | { kind: "block"; blockIds: number[]; index: number };

interface AddComposerState {
  isOpen: boolean;
  value: string;
  isSubmitting: boolean;
  error: string | null;
  message: string | null;
}

type AddComposerAction =
  | { type: "open" }
  | { type: "cancel" }
  | { type: "append"; input: string }
  | { type: "backspace" }
  | { type: "setSubmitting"; value: boolean }
  | { type: "setError"; error: string }
  | { type: "setMessage"; message: string };

const INITIAL_ADD_COMPOSER_STATE: AddComposerState = {
  isOpen: false,
  value: "",
  isSubmitting: false,
  error: null,
  message: null,
};

function addComposerReducer(
  state: AddComposerState,
  action: AddComposerAction,
): AddComposerState {
  switch (action.type) {
    case "open":
      return {
        ...state,
        isOpen: true,
        value: "",
        error: null,
        message: null,
      };
    case "cancel":
      return {
        ...state,
        isOpen: false,
        value: "",
        error: null,
      };
    case "append":
      return { ...state, value: state.value + action.input };
    case "backspace":
      return { ...state, value: state.value.slice(0, -1) };
    case "setSubmitting":
      return { ...state, isSubmitting: action.value };
    case "setError":
      return { ...state, error: action.error, message: null };
    case "setMessage":
      return { ...state, message: action.message, error: null };
  }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function ChannelCommand({
  slug,
  page: initialPage,
  per = 24,
}: {
  slug: string;
  page?: number;
  per?: number;
}) {
  if (!process.stdin.isTTY) {
    return <StaticChannelView slug={slug} page={initialPage ?? 1} per={per} />;
  }

  return <InteractiveChannel slug={slug} initialPage={initialPage} per={per} />;
}

// ---------------------------------------------------------------------------
// Interactive channel — stack-based navigation through channels and blocks
// ---------------------------------------------------------------------------

export function InteractiveChannel({
  slug,
  initialPage,
  per = 24,
  onExit: onExitProp,
}: {
  slug: string;
  initialPage?: number;
  per?: number;
  onExit?: () => void;
}) {
  const { exit } = useApp();
  const onExit = onExitProp ?? exit;

  const [stack, setStack] = useState<NavItem[]>([{ kind: "channel", slug }]);
  const stackRef = useRef(stack);
  stackRef.current = stack;

  const current = stack[stack.length - 1]!;

  const push = useCallback((item: NavItem) => {
    setStack((s) => [...s, item]);
  }, []);

  const pop = useCallback(() => {
    if (stackRef.current.length <= 1) return onExit();
    setStack((s) => s.slice(0, -1));
  }, [onExit]);

  if (current.kind === "block") {
    return (
      <BlockViewer
        blockIds={current.blockIds}
        index={current.index}
        onBack={pop}
        onNavigate={(newIndex) => {
          setStack((s) => [
            ...s.slice(0, -1),
            { kind: "block", blockIds: current.blockIds, index: newIndex },
          ]);
        }}
      />
    );
  }

  return (
    <ChannelBrowser
      slug={current.slug}
      initialPage={current === stack[0] ? initialPage : undefined}
      per={per}
      onNavigate={push}
      onBack={pop}
    />
  );
}

// ---------------------------------------------------------------------------
// Channel browser — interactive list with cursor, pagination, drill-in
// ---------------------------------------------------------------------------

function ChannelBrowser({
  slug,
  initialPage = 1,
  per,
  onNavigate,
  onBack,
}: {
  slug: string;
  initialPage?: number;
  per: number;
  onNavigate: (item: NavItem) => void;
  onBack: () => void;
}) {
  const [page, setPage] = useState(initialPage);
  const [cursor, setCursor] = useState(0);
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
          onNavigate({ kind: "channel", slug: (item as ChannelRef).slug });
        } else {
          const blockIds = items
            .filter((i) => i.type !== "Channel")
            .map((i) => i.id);
          onNavigate({
            kind: "block",
            blockIds,
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

// ---------------------------------------------------------------------------
// Block viewer — detail view with prev/next navigation
// ---------------------------------------------------------------------------

export function BlockViewer({
  blockIds,
  index,
  onBack,
  onNavigate,
}: {
  blockIds: number[];
  index: number;
  onBack: () => void;
  onNavigate: (index: number) => void;
}) {
  const id = blockIds[index]!;
  const hasPrev = index > 0;
  const hasNext = index < blockIds.length - 1;

  const {
    data: block,
    error,
    isLoading: loading,
  } = useSWR(`block/${id}`, () =>
    getData(client.GET("/v3/blocks/{id}", { params: { path: { id } } })),
  );

  useInput((input, key) => {
    switch (true) {
      case input === "q" || key.escape:
        onBack();
        break;
      case key.leftArrow && hasPrev:
        onNavigate(index - 1);
        break;
      case key.rightArrow && hasNext:
        onNavigate(index + 1);
        break;
      case input === "o" && !!block:
        openUrl(`https://www.are.na/block/${block.id}`);
        break;
    }
  });

  if (loading) return <Spinner label={`Loading block ${id}`} />;

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">✕ {error.message}</Text>
        <Text dimColor> Press q to go back</Text>
      </Box>
    );
  }

  if (!block) return null;

  return (
    <Box flexDirection="column">
      <BlockContent block={block} />
      <Box marginTop={1}>
        <Text dimColor>
          {index + 1}/{blockIds.length}
          {" · "}
          {hasPrev ? "← prev" : ""}
          {hasPrev && hasNext ? " · " : ""}
          {hasNext ? "→ next" : ""}
          {" · "}o browser · esc back
        </Text>
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Static fallback — used when stdin is not a TTY (piped, scripted, CI)
// ---------------------------------------------------------------------------

function StaticChannelView({
  slug,
  page,
  per,
}: {
  slug: string;
  page: number;
  per: number;
}) {
  const { data, error, loading } = useCommand(() =>
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

  if (loading) return <Spinner label={`Loading ${slug}`} />;

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">✕ {error}</Text>
        {error.includes("Not Found") && (
          <Text dimColor> Check the channel slug and try again</Text>
        )}
      </Box>
    );
  }

  if (!data) return null;

  const { channel, contents } = data;

  return (
    <Box flexDirection="column">
      <Box flexDirection="column" marginBottom={1}>
        <Text bold>{channel.title}</Text>
        <Text dimColor>
          {channel.owner.name} · {visibilityLabel(channel.visibility)} ·{" "}
          {plural(channel.counts.contents, "block")}
        </Text>
        <Text dimColor>Updated {timeAgo(channel.updated_at)}</Text>
      </Box>

      <Box flexDirection="column">
        {contents.data.map((item) => (
          <BlockItem key={`${item.type}-${item.id}`} item={item} />
        ))}
      </Box>

      {contents.meta.total_pages > 1 && (
        <Box marginTop={1}>
          <Text dimColor>
            Page {contents.meta.current_page}/{contents.meta.total_pages} ·{" "}
            {plural(contents.meta.total_count, "block")}
          </Text>
        </Box>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Channel CRUD commands (non-interactive, used by CLI router)
// ---------------------------------------------------------------------------

export function ChannelCreateCommand({
  title,
  visibility,
  description,
}: {
  title: string;
  visibility?: Visibility;
  description?: string;
}) {
  const { data, error, loading } = useCommand(() =>
    getData(
      client.POST("/v3/channels", {
        body: { title, visibility, description },
      }),
    ),
  );

  if (loading) return <Spinner label="Creating channel" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return (
    <Box>
      <Text color="green">✓ </Text>
      <Text>Created </Text>
      <Text bold>{data.title}</Text>
      <Text dimColor>
        {" "}
        · {data.slug} · {data.visibility}
      </Text>
    </Box>
  );
}

export function ChannelUpdateCommand({
  slug,
  title,
  visibility,
  description,
}: {
  slug: string;
  title?: string;
  visibility?: Visibility;
  description?: string;
}) {
  const { data, error, loading } = useCommand(() =>
    getData(
      client.PUT("/v3/channels/{id}", {
        params: { path: { id: slug } },
        body: { title, visibility, description },
      }),
    ),
  );

  if (loading) return <Spinner label="Updating channel" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return (
    <Box>
      <Text color="green">✓ </Text>
      <Text>Updated </Text>
      <Text bold>{data.title}</Text>
      <Text dimColor> · {data.slug}</Text>
    </Box>
  );
}

export function ChannelDeleteCommand({ slug }: { slug: string }) {
  const { data, error, loading } = useCommand(async () => {
    await client.DELETE("/v3/channels/{id}", {
      params: { path: { id: slug } },
    });
    return { slug };
  });

  if (loading) return <Spinner label="Deleting channel" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return (
    <Box>
      <Text color="green">✓ </Text>
      <Text>Deleted channel {data.slug}</Text>
    </Box>
  );
}
