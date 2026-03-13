import { Box, Text } from "ink";
import { client, getData } from "../api/client";
import type {
  ConnectionSort,
  ContentSort,
  ContentTypeFilter,
  FollowableType,
} from "../api/types";
import { BlockItem } from "../components/BlockItem";
import { Spinner } from "../components/Spinner";
import { useCommand } from "../hooks/use-command";
import { formatCounts, formatFollowable, plural, timeAgo } from "../lib/format";

export function UserViewCommand({ slug }: { slug: string }) {
  const { data, error, loading } = useCommand(() =>
    getData(
      client.GET("/v3/users/{id}", {
        params: { path: { id: slug } },
      }),
    ),
  );

  if (loading) return <Spinner label="Loading user" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return (
    <Box flexDirection="column">
      <Text bold>{data.name}</Text>
      <Text dimColor>@{data.slug}</Text>
      {data.bio?.plain && <Text>{data.bio.plain}</Text>}
      <Text dimColor>{formatCounts(data)}</Text>
      {data.created_at && (
        <Text dimColor>Joined {timeAgo(data.created_at)}</Text>
      )}
    </Box>
  );
}

export function UserContentsCommand({
  slug,
  page = 1,
  per,
  type,
  sort,
}: {
  slug: string;
  page?: number;
  per?: number;
  type?: string;
  sort?: ContentSort;
}) {
  const { data, error, loading } = useCommand(() =>
    getData(
      client.GET("/v3/users/{id}/contents", {
        params: {
          path: { id: slug },
          query: {
            page,
            per,
            type: type as ContentTypeFilter | undefined,
            sort,
          },
        },
      }),
    ),
  );

  if (loading) return <Spinner label="Loading contents" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  if (data.data.length === 0) return <Text dimColor>No contents</Text>;

  return (
    <Box flexDirection="column">
      {data.data.map((item) => (
        <BlockItem key={item.id} item={item} />
      ))}
      <Text dimColor>
        {"\n"}Page {data.meta.current_page}/{data.meta.total_pages} ·{" "}
        {plural(data.meta.total_count, "item")}
      </Text>
    </Box>
  );
}

export function UserFollowersCommand({
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
      client.GET("/v3/users/{id}/followers", {
        params: { path: { id: slug }, query: { page, per, sort } },
      }),
    ),
  );

  if (loading) return <Spinner label="Loading followers" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  if (data.data.length === 0) return <Text dimColor>No followers</Text>;

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

export function UserFollowingCommand({
  slug,
  page = 1,
  per,
  type,
  sort,
}: {
  slug: string;
  page?: number;
  per?: number;
  type?: string;
  sort?: ConnectionSort;
}) {
  const { data, error, loading } = useCommand(() =>
    getData(
      client.GET("/v3/users/{id}/following", {
        params: {
          path: { id: slug },
          query: {
            page,
            per,
            type: type as FollowableType | undefined,
            sort,
          },
        },
      }),
    ),
  );

  if (loading) return <Spinner label="Loading following" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  if (data.data.length === 0) return <Text dimColor>No following</Text>;

  return (
    <Box flexDirection="column">
      {data.data.map((item) => (
        <Text key={item.id}>{formatFollowable(item)}</Text>
      ))}
      <Text dimColor>
        {"\n"}Page {data.meta.current_page}/{data.meta.total_pages} ·{" "}
        {plural(data.meta.total_count, "item")}
      </Text>
    </Box>
  );
}
