import { Box, Text, useApp } from "ink";
import { client, getData } from "../api/client";
import type {
  ChannelContentSort,
  Metadata,
  MetadataInput,
  Visibility,
} from "../api/types";
import { BlockItem } from "../components/BlockItem";
import { ChannelBlockViewer } from "../components/ChannelBlockViewer";
import {
  ChannelBrowser,
  type ChannelNavItem as NavItem,
} from "../components/ChannelBrowser";
import { Spinner } from "../components/Spinner";
import { useCommand } from "../hooks/use-command";
import { useStackNavigator } from "../hooks/useStackNavigator";
import { plural, timeAgo } from "../lib/format";
import { formatMetadata } from "../lib/metadata";
import { clearTerminalViewport } from "../lib/terminalViewport";
import { visibilityLabel } from "../lib/theme";

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
  const { current, push, pop, replace, popTo } = useStackNavigator<NavItem>(
    { kind: "channel", slug, page: initialPage ?? 1, cursor: 0 },
    { onPopRoot: onExit, beforeTransition: clearTerminalViewport },
  );

  if (current.kind === "block") {
    return (
      <ChannelBlockViewer
        key={`block:${current.slug}:${current.page}:${current.index}`}
        slug={current.slug}
        initialPage={current.page}
        per={per}
        index={current.index}
        onBack={({ page, cursor }) => {
          popTo({
            kind: "channel",
            slug: current.slug,
            page,
            cursor,
          });
        }}
        onNavigate={({ page, index }) => {
          replace({ kind: "block", slug: current.slug, page, index });
        }}
      />
    );
  }

  return (
    <ChannelBrowser
      key={`channel:${current.slug}:${current.page}:${current.cursor}`}
      slug={current.slug}
      initialPage={current.page}
      initialCursor={current.cursor}
      per={per}
      onNavigate={push}
      onBack={pop}
    />
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
        {channel.metadata && (
          <Text dimColor>Metadata {formatMetadata(channel.metadata)}</Text>
        )}
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
// Channel contents — paginated contents without channel metadata
// ---------------------------------------------------------------------------

export function ChannelContentsCommand({
  slug,
  page = 1,
  per = 24,
  sort,
  userId,
}: {
  slug: string;
  page?: number;
  per?: number;
  sort?: ChannelContentSort;
  userId?: number;
}) {
  const { data, error, loading } = useCommand(() =>
    getData(
      client.GET("/v3/channels/{id}/contents", {
        params: {
          path: { id: slug },
          query: { page, per, sort: sort ?? "position_desc", user_id: userId },
        },
      }),
    ),
  );

  if (loading) return <Spinner label={`Loading ${slug} contents`} />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return (
    <Box flexDirection="column">
      <Box flexDirection="column">
        {data.data.map((item) => (
          <BlockItem key={`${item.type}-${item.id}`} item={item} />
        ))}
      </Box>

      {data.meta.total_pages > 1 && (
        <Box marginTop={1}>
          <Text dimColor>
            Page {data.meta.current_page}/{data.meta.total_pages} ·{" "}
            {plural(data.meta.total_count, "block")}
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
  groupId,
  metadata,
}: {
  title: string;
  visibility?: Visibility;
  description?: string;
  groupId?: number;
  metadata?: Metadata;
}) {
  const { data, error, loading } = useCommand(() =>
    getData(
      client.POST("/v3/channels", {
        body: { title, visibility, description, group_id: groupId, metadata },
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
  metadata,
}: {
  slug: string;
  title?: string;
  visibility?: Visibility;
  description?: string;
  metadata?: MetadataInput;
}) {
  const { data, error, loading } = useCommand(() =>
    getData(
      client.PUT("/v3/channels/{id}", {
        params: { path: { id: slug } },
        body: { title, visibility, description, metadata },
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
