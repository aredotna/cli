import { Box, Text } from "ink";
import { arena } from "../api/client";
import { Spinner } from "../components/Spinner";
import { useCommand } from "../hooks/use-command";

interface Props {
  blockId: number;
  body: string;
}

export function CommentCommand({ blockId, body }: Props) {
  const { data, error, loading } = useCommand(async () => {
    await arena.createComment(blockId, body);
    return { blockId };
  });

  if (loading) return <Spinner label="Adding comment" />;

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">✕ {error}</Text>
        {error.includes("Unauthorized") && (
          <Text dimColor> Run `arena login` to authenticate</Text>
        )}
      </Box>
    );
  }

  if (!data) return null;

  return (
    <Box>
      <Text color="green">✓ </Text>
      <Text>Comment added to block {data.blockId}</Text>
    </Box>
  );
}
