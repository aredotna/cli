import { Box, Text } from "ink";
import { arena } from "../api/client";
import { BlockItem } from "../components/BlockItem";
import { Spinner } from "../components/Spinner";
import { useCommand } from "../hooks/use-command";
import { plural, timeAgo } from "../lib/format";

interface GroupViewProps {
  slug: string;
}

export function GroupView({ slug }: GroupViewProps) {
  const { data, error, loading } = useCommand(() => arena.getGroup(slug));

  if (loading) return <Spinner label="Loading group" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return (
    <Box flexDirection="column">
      <Text bold>{data.name}</Text>
      <Text dimColor>@{data.slug}</Text>
      {data.bio?.plain && <Text>{data.bio.plain}</Text>}
      <Text dimColor>
        {plural(data.counts.channels, "channel")} ·{" "}
        {plural(data.counts.users, "member")}
      </Text>
      <Text dimColor>Created {timeAgo(data.created_at)}</Text>
    </Box>
  );
}

interface GroupContentsProps {
  slug: string;
  page?: number;
  per?: number;
  type?: string;
}

export function GroupContents({ slug, page = 1, per, type }: GroupContentsProps) {
  const { data, error, loading } = useCommand(() =>
    arena.getGroupContents(slug, { page, per, type }),
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

interface GroupFollowersProps {
  slug: string;
  page?: number;
  per?: number;
}

export function GroupFollowers({ slug, page = 1, per }: GroupFollowersProps) {
  const { data, error, loading } = useCommand(() =>
    arena.getGroupFollowers(slug, { page, per }),
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
