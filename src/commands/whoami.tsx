import { Box, Text } from "ink";
import { arena } from "../api/client";
import { Spinner } from "../components/Spinner";
import { useCommand } from "../hooks/use-command";
import { plural } from "../lib/format";

export function WhoamiCommand() {
  const { data, error, loading } = useCommand(() => arena.getMe());

  if (loading) return <Spinner label="Loading profile" />;

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">✕ {error}</Text>
        {error.includes("Unauthorized") && (
          <Text dimColor>  Run `arena login` to authenticate</Text>
        )}
      </Box>
    );
  }

  if (!data) return null;

  return (
    <Box flexDirection="column">
      <Text bold>{data.name}</Text>
      <Text dimColor>@{data.slug}</Text>
      <Text dimColor>
        {data.channel_count !== undefined && plural(data.channel_count, "channel")}
        {data.following_count !== undefined && ` · ${plural(data.following_count, "following")}`}
        {data.follower_count !== undefined && ` · ${plural(data.follower_count, "follower")}`}
      </Text>
    </Box>
  );
}
