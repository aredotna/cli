import { Box, Text } from "ink";
import { client, getData } from "../api/client";
import { Spinner } from "../components/Spinner";
import { useCommand } from "../hooks/use-command";

interface Props {
  channel: string;
  value: string;
}

export function AddCommand({ channel, value }: Props) {
  const { data, error, loading } = useCommand(async () => {
    const ch = await getData(
      client.GET("/v3/channels/{id}", {
        params: { path: { id: channel } },
      }),
    );
    const block = await getData(
      client.POST("/v3/blocks", {
        body: { value, channel_ids: [ch.id] },
      }),
    );
    return { block, channel: ch };
  });

  if (loading) return <Spinner label={`Adding to ${channel}`} />;

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
      <Text>Added to </Text>
      <Text bold>{data.channel.title}</Text>
    </Box>
  );
}
