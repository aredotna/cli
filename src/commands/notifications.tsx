import { Box, Text } from "ink";
import { client, getData } from "../api/client";
import { Spinner } from "../components/Spinner";
import { useCommand } from "../hooks/use-command";
import { formatActivity, timeAgo } from "../lib/format";

export function NotificationsCommand({
  limit,
  next,
  prev,
  unread,
}: {
  limit?: number;
  next?: string;
  prev?: string;
  unread?: boolean;
}) {
  const { data, error, loading } = useCommand(() =>
    getData(
      client.GET("/v3/me/notifications", {
        params: { query: { limit, next, prev, unread } },
      }),
    ),
  );

  if (loading) return <Spinner label="Loading notifications" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return (
    <Box flexDirection="column">
      {data.data.length === 0 ? (
        <Text dimColor>No notifications</Text>
      ) : (
        data.data.map((notification) => (
          <Text key={notification.id}>
            <Text color={notification.is_read ? undefined : "green"}>
              {notification.is_read ? "read" : "unread"}
            </Text>{" "}
            {formatActivity(notification)}{" "}
            <Text dimColor>· {timeAgo(notification.created_at)}</Text>
          </Text>
        ))
      )}
      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>
          Limit {data.meta.limit} ·{" "}
          {data.meta.has_more ? "More available" : "End of notifications"}
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

export function NotificationReadCommand({ id }: { id: number }) {
  const { data, error, loading } = useCommand(() =>
    getData(
      client.POST("/v3/me/notifications/{id}/read", {
        params: { path: { id } },
      }),
    ),
  );

  if (loading) return <Spinner label="Marking notification read" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return (
    <Box flexDirection="column">
      <Text>
        <Text color="green">✓ </Text>
        <Text>Marked notification {data.data.id} as read</Text>
      </Text>
      <Text dimColor>{data.meta.notifications} unread remaining</Text>
    </Box>
  );
}

export function NotificationsReadAllCommand() {
  const { data, error, loading } = useCommand(() =>
    getData(client.POST("/v3/me/notifications/read")),
  );

  if (loading) return <Spinner label="Marking notifications read" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return (
    <Box flexDirection="column">
      <Text>
        <Text color="green">✓ </Text>
        <Text>Marked all notifications as read</Text>
      </Text>
      <Text dimColor>{data.meta.notifications} unread remaining</Text>
    </Box>
  );
}
