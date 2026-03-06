import { Box, Text } from "ink";
import { arena } from "../api/client";
import { BlockItem } from "../components/BlockItem";
import { Spinner } from "../components/Spinner";
import { useCommand } from "../hooks/use-command";
import { plural, timeAgo } from "../lib/format";
import type { Followable } from "../api/types";

interface UserViewProps {
  slug: string;
}

export function UserView({ slug }: UserViewProps) {
  const { data, error, loading } = useCommand(() => arena.getUser(slug));

  if (loading) return <Spinner label="Loading user" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return (
    <Box flexDirection="column">
      <Text bold>{data.name}</Text>
      <Text dimColor>@{data.slug}</Text>
      {data.bio?.plain && <Text>{data.bio.plain}</Text>}
      <Text dimColor>
        {data.counts
          ? `${plural(data.counts.channels, "channel")} · ${plural(data.counts.followers, "follower")} · ${data.counts.following} following`
          : [
              data.channel_count !== undefined &&
                plural(data.channel_count, "channel"),
              data.follower_count !== undefined &&
                plural(data.follower_count, "follower"),
            ]
              .filter(Boolean)
              .join(" · ")}
      </Text>
      {data.created_at && (
        <Text dimColor>Joined {timeAgo(data.created_at)}</Text>
      )}
    </Box>
  );
}

interface UserContentsProps {
  slug: string;
  page?: number;
  per?: number;
  type?: string;
}

export function UserContents({ slug, page = 1, per, type }: UserContentsProps) {
  const { data, error, loading } = useCommand(() =>
    arena.getUserContents(slug, { page, per, type }),
  );

  if (loading) return <Spinner label="Loading contents" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return (
    <Box flexDirection="column">
      {data.data.length === 0 ? (
        <Text dimColor>No contents</Text>
      ) : (
        data.data.map((item) => <BlockItem key={item.id} item={item} />)
      )}
      <Text dimColor>
        {"\n"}Page {data.meta.current_page}/{data.meta.total_pages} ·{" "}
        {plural(data.meta.total_count, "item")}
      </Text>
    </Box>
  );
}

interface UserFollowersProps {
  slug: string;
  page?: number;
  per?: number;
}

export function UserFollowers({ slug, page = 1, per }: UserFollowersProps) {
  const { data, error, loading } = useCommand(() =>
    arena.getUserFollowers(slug, { page, per }),
  );

  if (loading) return <Spinner label="Loading followers" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return (
    <Box flexDirection="column">
      {data.data.length === 0 ? (
        <Text dimColor>No followers</Text>
      ) : (
        data.data.map((user) => (
          <Text key={user.id}>
            {user.name} <Text dimColor>@{user.slug}</Text>
          </Text>
        ))
      )}
      <Text dimColor>
        {"\n"}Page {data.meta.current_page}/{data.meta.total_pages} ·{" "}
        {plural(data.meta.total_count, "follower")}
      </Text>
    </Box>
  );
}

function formatFollowable(item: Followable): string {
  if (item.type === "User") return `${item.name} (@${item.slug})`;
  if (item.type === "Channel") return `${item.title} [channel]`;
  if (item.type === "Group") return `${item.name} [group]`;
  return String((item as { id: number }).id);
}

interface UserFollowingProps {
  slug: string;
  page?: number;
  per?: number;
  type?: string;
}

export function UserFollowing({
  slug,
  page = 1,
  per,
  type,
}: UserFollowingProps) {
  const { data, error, loading } = useCommand(() =>
    arena.getUserFollowing(slug, { page, per, type }),
  );

  if (loading) return <Spinner label="Loading following" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return (
    <Box flexDirection="column">
      {data.data.length === 0 ? (
        <Text dimColor>No following</Text>
      ) : (
        data.data.map((item) => (
          <Text key={item.id}>{formatFollowable(item)}</Text>
        ))
      )}
      <Text dimColor>
        {"\n"}Page {data.meta.current_page}/{data.meta.total_pages} ·{" "}
        {plural(data.meta.total_count, "item")}
      </Text>
    </Box>
  );
}
