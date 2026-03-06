import { Box, Text } from "ink";
import { arena } from "../api/client";
import type { Followable } from "../api/types";
import { BlockItem } from "../components/BlockItem";
import { Spinner } from "../components/Spinner";
import { useCommand } from "../hooks/use-command";
import { plural, timeAgo } from "../lib/format";

function formatCounts(data: {
  counts?: { channels: number; followers: number; following: number };
  channel_count?: number;
  follower_count?: number;
  following_count?: number;
}): string {
  if (data.counts) {
    return [
      plural(data.counts.channels, "channel"),
      plural(data.counts.followers, "follower"),
      `${data.counts.following} following`,
    ].join(" · ");
  }

  return [
    data.channel_count !== undefined
      ? plural(data.channel_count, "channel")
      : null,
    data.follower_count !== undefined
      ? plural(data.follower_count, "follower")
      : null,
    data.following_count !== undefined
      ? `${data.following_count} following`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function UserView({ slug }: { slug: string }) {
  const { data, error, loading } = useCommand(() => arena.getUser(slug));

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

export function UserContents({
  slug,
  page = 1,
  per,
  type,
}: {
  slug: string;
  page?: number;
  per?: number;
  type?: string;
}) {
  const { data, error, loading } = useCommand(() =>
    arena.getUserContents(slug, { page, per, type }),
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

export function UserFollowers({
  slug,
  page = 1,
  per,
}: {
  slug: string;
  page?: number;
  per?: number;
}) {
  const { data, error, loading } = useCommand(() =>
    arena.getUserFollowers(slug, { page, per }),
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

function formatFollowable(item: Followable): string {
  switch (item.type) {
    case "User":
      return `${item.name} (@${item.slug})`;
    case "Channel":
      return `${item.title} [channel]`;
    case "Group":
      return `${item.name} [group]`;
  }
}

export function UserFollowing({
  slug,
  page = 1,
  per,
  type,
}: {
  slug: string;
  page?: number;
  per?: number;
  type?: string;
}) {
  const { data, error, loading } = useCommand(() =>
    arena.getUserFollowing(slug, { page, per, type }),
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
