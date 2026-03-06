import { Box, Text } from "ink";
import { arena } from "../api/client";
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
    await arena.createComment(blockId, body);
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
    await arena.deleteComment(id);
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
