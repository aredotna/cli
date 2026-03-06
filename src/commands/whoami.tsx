import { Box, Text } from "ink";
import { arena } from "../api/client";
import { Spinner } from "../components/Spinner";
import { useCommand } from "../hooks/use-command";
import { plural } from "../lib/format";

export function WhoamiCommand() {
  const { data, error, loading } = useCommand(() => arena.getMe());

  if (loading) return <Spinner label="Loading profile" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  const stats = [
    data.channel_count !== undefined
      ? plural(data.channel_count, "channel")
      : null,
    data.following_count !== undefined
      ? `${data.following_count} following`
      : null,
    data.follower_count !== undefined
      ? plural(data.follower_count, "follower")
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Box flexDirection="column">
      <Text bold>{data.name}</Text>
      <Text dimColor>@{data.slug}</Text>
      {stats && <Text dimColor>{stats}</Text>}
    </Box>
  );
}
