import { Box, Text } from "ink";
import { client, getData } from "../api/client";
import { Spinner } from "../components/Spinner";
import { useCommand } from "../hooks/use-command";
import { formatActivity, timeAgo } from "../lib/format";

export function FeedCommand({
  limit,
  next,
  prev,
}: {
  limit?: number;
  next?: string;
  prev?: string;
}) {
  const { data, error, loading } = useCommand(() =>
    getData(
      client.GET("/v3/me/feed", {
        params: { query: { limit, next, prev } },
      }),
    ),
  );

  if (loading) return <Spinner label="Loading feed" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return (
    <Box flexDirection="column">
      {data.data.length === 0 ? (
        <Text dimColor>No feed items</Text>
      ) : (
        data.data.map((activity) => (
          <Text key={activity.id}>
            {formatActivity(activity)}{" "}
            <Text dimColor>· {timeAgo(activity.created_at)}</Text>
          </Text>
        ))
      )}
      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>
          Limit {data.meta.limit} ·{" "}
          {data.meta.has_more ? "More available" : "End of feed"}
        </Text>
        {data.meta.next_cursor && (
          <Text dimColor>Next: {data.meta.next_cursor}</Text>
        )}
        {data.meta.prev_cursor && (
          <Text dimColor>Prev: {data.meta.prev_cursor}</Text>
        )}
      </Box>
    </Box>
  );
}
