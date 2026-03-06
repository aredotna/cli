import { Box, Text } from "ink";
import { arena } from "../api/client";
import { Spinner } from "../components/Spinner";
import { useCommand } from "../hooks/use-command";

interface Props {
  blockId: number;
  channel: string;
}

export function ConnectCommand({ blockId, channel }: Props) {
  const { data, error, loading } = useCommand(async () => {
    const ch = await arena.getChannel(channel);
    await arena.connect(blockId, [ch.id]);
    return { channel: ch };
  });

  if (loading) return <Spinner label="Connecting" />;

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
      <Text>Connected block {blockId} to </Text>
      <Text bold>{data.channel.title}</Text>
    </Box>
  );
}
