import { Box, Text } from "ink";
import { client } from "../api/client";
import { Spinner } from "../components/Spinner";
import { useCommand } from "../hooks/use-command";

export function CommentCommand({
  blockId,
  body,
}: {
  blockId: number;
  body: string;
}) {
  const { data, error, loading } = useCommand(async () => {
    await client.POST("/v3/blocks/{id}/comments", {
      params: { path: { id: blockId } },
      body: { body },
    });
    return { blockId };
  });

  if (loading) return <Spinner label="Adding comment" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return (
    <Box>
      <Text color="green">✓ </Text>
      <Text>Comment added to block {data.blockId}</Text>
    </Box>
  );
}

export function CommentDeleteCommand({ id }: { id: number }) {
  const { data, error, loading } = useCommand(async () => {
    await client.DELETE("/v3/comments/{id}", { params: { path: { id } } });
    return { id };
  });

  if (loading) return <Spinner label="Deleting comment" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return (
    <Box>
      <Text color="green">✓ </Text>
      <Text>Deleted comment {data.id}</Text>
    </Box>
  );
}
