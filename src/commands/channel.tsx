import { useState, useEffect, useCallback, useRef } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { arena } from "../api/client";
import type {
  Block,
  Channel,
  ChannelRef,
  Connectable,
  PaginatedResponse,
} from "../api/types";
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

interface Props {
  slug: string;
  page?: number;
  per?: number;
}

export function ChannelCommand({ slug, page: initialPage, per = 24 }: Props) {
  if (!process.stdin.isTTY) {
    return (
      <StaticChannelView slug={slug} page={initialPage ?? 1} per={per} />
    );
  }

  return (
    <InteractiveChannel slug={slug} initialPage={initialPage} per={per} />
  );
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

  const [stack, setStack] = useState<NavItem[]>([
    { kind: "channel", slug },
  ]);

  const stackRef = useRef(stack);
  stackRef.current = stack;

  const current = stack[stack.length - 1]!;

  const push = useCallback((item: NavItem) => {
    setStack((s) => [...s, item]);
  }, []);

  const pop = useCallback(() => {
    if (stackRef.current.length <= 1) {
      onExit();
    } else {
      setStack((s) => s.slice(0, -1));
    }
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

interface BrowserProps {
  slug: string;
  initialPage?: number;
  per: number;
  onNavigate: (item: NavItem) => void;
  onBack: () => void;
}

function ChannelBrowser({
  slug,
  initialPage = 1,
  per,
  onNavigate,
  onBack,
}: BrowserProps) {
  const [page, setPage] = useState(initialPage);
  const [cursor, setCursor] = useState(0);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [contents, setContents] = useState<PaginatedResponse<Connectable> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      arena.getChannel(slug),
      arena.getChannelContents(slug, { page, per }),
    ])
      .then(([ch, co]) => {
        setChannel(ch);
        setContents(co);
        setCursor(0);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
  }, [slug, page, per]);

  useInput((input, key) => {
    if (input === "q" || key.escape) {
      onBack();
      return;
    }

    if (loading || !contents) return;
    const items = contents.data;

    if (key.upArrow || input === "k") {
      setCursor((c) => Math.max(0, c - 1));
    } else if (key.downArrow || input === "j") {
      setCursor((c) => Math.min(items.length - 1, c + 1));
    } else if (key.return) {
      const item = items[cursor];
      if (!item) return;
      if (item.type === "Channel" && "slug" in item) {
        onNavigate({ kind: "channel", slug: (item as ChannelRef).slug });
      } else {
        const blockIds = items
          .filter((i) => i.type !== "Channel")
          .map((i) => i.id);
        const blockIndex = blockIds.indexOf(item.id);
        onNavigate({ kind: "block", blockIds, index: blockIndex });
      }
    } else if ((input === "n" || key.rightArrow) && contents.meta.has_more_pages) {
      setPage((p) => p + 1);
    } else if ((input === "p" || key.leftArrow) && page > 1) {
      setPage((p) => p - 1);
    } else if (input === "o") {
      const item = items[cursor];
      if (!item) return;
      if (item.type === "Channel" && "slug" in item) {
        const ch = item as ChannelRef;
        openUrl(`https://www.are.na/${ch.owner?.slug || ""}/${ch.slug}`);
      } else {
        openUrl(`https://www.are.na/block/${item.id}`);
      }
    }
  });

  if (loading) return <Spinner label={`Loading ${slug}`} />;

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">✕ {error}</Text>
        <Text dimColor>  Press q to go back</Text>
      </Box>
    );
  }

  if (!channel || !contents) return null;

  return (
    <Box flexDirection="column">
      <Box flexDirection="column" marginBottom={1}>
        <Text bold>{channel.title}</Text>
        <Text dimColor>
          {channel.owner.name} · {visibilityLabel(channel.visibility)} ·{" "}
          {plural(channel.counts.contents, "block")}
        </Text>
      </Box>

      {contents.data.length === 0 ? (
        <Text dimColor>This channel is empty</Text>
      ) : (
        <Box flexDirection="column">
          {contents.data.map((item, i) => (
            <BlockItem
              key={`${item.type}-${item.id}`}
              item={item}
              selected={i === cursor}
            />
          ))}
        </Box>
      )}

      <Box marginTop={1} flexDirection="column">
        {contents.meta.total_pages > 1 && (
          <Text dimColor>
            Page {contents.meta.current_page}/{contents.meta.total_pages} ·{" "}
            {plural(contents.meta.total_count, "block")}
          </Text>
        )}
        <Text dimColor>
          ↑↓ navigate · ↵ open · ←→ page · o browser · q back
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

  const [block, setBlock] = useState<Block | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    arena
      .getBlock(id)
      .then((b) => {
        setBlock(b);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
  }, [id]);

  useInput((input, key) => {
    if (input === "q" || key.escape) {
      onBack();
    } else if (key.leftArrow && hasPrev) {
      onNavigate(index - 1);
    } else if (key.rightArrow && hasNext) {
      onNavigate(index + 1);
    } else if (input === "o" && block) {
      openUrl(`https://www.are.na/block/${block.id}`);
    }
  });

  if (loading) return <Spinner label={`Loading block ${id}`} />;

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">✕ {error}</Text>
        <Text dimColor>  Press q to go back</Text>
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
  const { data, error, loading } = useCommand(async () => {
    const [channel, contents] = await Promise.all([
      arena.getChannel(slug),
      arena.getChannelContents(slug, { page, per }),
    ]);
    return { channel, contents };
  });

  if (loading) return <Spinner label={`Loading ${slug}`} />;

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">✕ {error}</Text>
        {error.includes("Not Found") && (
          <Text dimColor>  Check the channel slug and try again</Text>
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
