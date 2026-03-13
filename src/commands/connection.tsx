import { Box, Text } from "ink";
import { client, getData } from "../api/client";
import type { ConnectionFilter, ConnectionSort, Movement } from "../api/types";
import { Spinner } from "../components/Spinner";
import { useCommand } from "../hooks/use-command";
import { plural } from "../lib/format";
import { channelColor, INDICATORS } from "../lib/theme";

export function ConnectionGetCommand({ id }: { id: number }) {
  const { data, error, loading } = useCommand(() =>
    getData(
      client.GET("/v3/connections/{id}", {
        params: { path: { id } },
      }),
    ),
  );

  if (loading) return <Spinner label="Loading connection" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return (
    <Box flexDirection="column">
      <Text>Connection {data.id}</Text>
      <Text dimColor>
        position: {data.position} · pinned: {String(data.pinned)} · can remove:{" "}
        {String(data.can.remove)}
      </Text>
      {data.connected_by && (
        <Text dimColor>Connected by {data.connected_by.name}</Text>
      )}
    </Box>
  );
}

export function ConnectionDeleteCommand({ id }: { id: number }) {
  const { data, error, loading } = useCommand(async () => {
    await client.DELETE("/v3/connections/{id}", {
      params: { path: { id } },
    });
    return { id };
  });

  if (loading) return <Spinner label="Deleting connection" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return (
    <Box>
      <Text color="green">✓ </Text>
      <Text>Deleted connection {data.id}</Text>
    </Box>
  );
}

export function ConnectionMoveCommand({
  id,
  movement,
  position,
}: {
  id: number;
  movement: Movement;
  position?: number;
}) {
  const { data, error, loading } = useCommand(() =>
    getData(
      client.POST("/v3/connections/{id}/move", {
        params: { path: { id } },
        body: { movement, position },
      }),
    ),
  );

  if (loading) return <Spinner label="Moving connection" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return (
    <Box>
      <Text color="green">✓ </Text>
      <Text>Moved to position {data.position}</Text>
    </Box>
  );
}

export function BlockConnectionsCommand({
  id,
  page = 1,
  per,
  sort,
  filter,
}: {
  id: number;
  page?: number;
  per?: number;
  sort?: ConnectionSort;
  filter?: ConnectionFilter;
}) {
  const { data, error, loading } = useCommand(() =>
    getData(
      client.GET("/v3/blocks/{id}/connections", {
        params: { path: { id }, query: { page, per, sort, filter } },
      }),
    ),
  );

  if (loading) return <Spinner label="Loading connections" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  if (data.data.length === 0) {
    return <Text dimColor>Not connected to any channels</Text>;
  }

  return (
    <Box flexDirection="column">
      {data.data.map((ch) => (
        <Text key={ch.id}>
          <Text color={channelColor(ch.visibility)}>
            {INDICATORS.Channel} {ch.title}
          </Text>{" "}
          <Text dimColor>
            @{ch.slug} · {ch.visibility}
          </Text>
        </Text>
      ))}
      <Text dimColor>
        {"\n"}Page {data.meta.current_page}/{data.meta.total_pages} ·{" "}
        {plural(data.meta.total_count, "channel")}
      </Text>
    </Box>
  );
}

export function ChannelConnectionsCommand({
  slug,
  page = 1,
  per,
  sort,
}: {
  slug: string;
  page?: number;
  per?: number;
  sort?: ConnectionSort;
}) {
  const { data, error, loading } = useCommand(() =>
    getData(
      client.GET("/v3/channels/{id}/connections", {
        params: { path: { id: slug }, query: { page, per, sort } },
      }),
    ),
  );

  if (loading) return <Spinner label="Loading connections" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  if (data.data.length === 0) {
    return <Text dimColor>Not connected to any channels</Text>;
  }

  return (
    <Box flexDirection="column">
      {data.data.map((ch) => (
        <Text key={ch.id}>
          <Text color={channelColor(ch.visibility)}>
            {INDICATORS.Channel} {ch.title}
          </Text>{" "}
          <Text dimColor>
            @{ch.slug} · {ch.visibility}
          </Text>
        </Text>
      ))}
      <Text dimColor>
        {"\n"}Page {data.meta.current_page}/{data.meta.total_pages} ·{" "}
        {plural(data.meta.total_count, "channel")}
      </Text>
    </Box>
  );
}

export function ChannelFollowersCommand({
  slug,
  page = 1,
  per,
  sort,
}: {
  slug: string;
  page?: number;
  per?: number;
  sort?: ConnectionSort;
}) {
  const { data, error, loading } = useCommand(() =>
    getData(
      client.GET("/v3/channels/{id}/followers", {
        params: { path: { id: slug }, query: { page, per, sort } },
      }),
    ),
  );

  if (loading) return <Spinner label="Loading followers" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  if (data.data.length === 0) {
    return <Text dimColor>No followers</Text>;
  }

  return (
    <Box flexDirection="column">
      {data.data.map((user) => (
        <Text key={user.id}>
          {user.name} <Text dimColor>@{user.slug}</Text>
        </Text>
      ))}
      <Text dimColor>
        {"\n"}Page {data.meta.current_page}/{data.meta.total_pages} ·{" "}
        {plural(data.meta.total_count, "follower")}
      </Text>
    </Box>
  );
}
