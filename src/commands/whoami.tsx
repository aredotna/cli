import { Box, Text } from "ink";
import { arenaApiBaseUrl, client, getData } from "../api/client";
import { Spinner } from "../components/Spinner";
import { useCommand } from "../hooks/use-command";
import { plural } from "../lib/format";

export function WhoamiCommand() {
  const { data, error, loading } = useCommand(() =>
    getData(client.GET("/v3/me")),
  );

  if (loading) return <Spinner label="Loading profile" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  const stats = [
    plural(data.counts.channels, "channel"),

    `${data.counts.following.toLocaleString()} following`,
    plural(data.counts.followers, "follower"),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Box flexDirection="column">
      <Text bold>{data.name}</Text>
      <Text dimColor>@{data.slug}</Text>
      {stats && <Text dimColor>{stats}</Text>}
      <Text dimColor>API: {arenaApiBaseUrl}</Text>
    </Box>
  );
}
