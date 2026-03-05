import { Box, Text } from "ink";
import { arena } from "../api/client";
import { BlockContent } from "../components/BlockContent";
import { Spinner } from "../components/Spinner";
import { useCommand } from "../hooks/use-command";

interface Props {
  id: number;
}

export function BlockCommand({ id }: Props) {
  const { data, error, loading } = useCommand(() => arena.getBlock(id));

  if (loading) return <Spinner label={`Loading block ${id}`} />;

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">✕ {error}</Text>
        {error.includes("Not Found") && (
          <Text dimColor>  Check that the block ID is correct</Text>
        )}
      </Box>
    );
  }

  if (!data) return null;

  return <BlockContent block={data} />;
}
