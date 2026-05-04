import { Box, Text } from "ink";
import { client, getData } from "../api/client";
import type { ConnectableType, Metadata } from "../api/types";
import { Spinner } from "../components/Spinner";
import { useCommand } from "../hooks/use-command";

interface Props {
  blockId: number;
  channel: string;
  connectableType?: ConnectableType;
  position?: number;
  metadata?: Metadata;
}

export function ConnectCommand({
  blockId,
  channel,
  connectableType = "Block",
  position,
  metadata,
}: Props) {
  const { data, error, loading } = useCommand(async () => {
    const ch = await getData(
      client.GET("/v3/channels/{id}", {
        params: { path: { id: channel } },
      }),
    );

    await client.POST("/v3/connections", {
      body: {
        connectable_id: blockId,
        connectable_type: connectableType,
        channels: [{ id: ch.id, position, metadata }],
      },
    });
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
