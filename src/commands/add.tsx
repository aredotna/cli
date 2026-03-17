import { Box, Text } from "ink";
import { client, getData } from "../api/client";
import { readStdin } from "../lib/args";
import { Spinner } from "../components/Spinner";
import { useCommand } from "../hooks/use-command";

interface Props {
  channel: string;
  value?: string;
  title?: string;
  description?: string;
  altText?: string;
  originalSourceUrl?: string;
  originalSourceTitle?: string;
  insertAt?: number;
}

export function AddCommand({
  channel,
  value: valueProp,
  title,
  description,
  altText,
  originalSourceUrl,
  originalSourceTitle,
  insertAt,
}: Props) {
  const { data, error, loading } = useCommand(async () => {
    const resolvedValue = valueProp ?? (await readStdin());
    if (!resolvedValue) throw new Error("Missing required argument: value");

    const ch = await getData(
      client.GET("/v3/channels/{id}", {
        params: { path: { id: channel } },
      }),
    );
    const block = await getData(
      client.POST("/v3/blocks", {
        body: {
          value: resolvedValue,
          channel_ids: [ch.id],
          title,
          description,
          alt_text: altText,
          original_source_url: originalSourceUrl,
          original_source_title: originalSourceTitle,
          insert_at: insertAt,
        },
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
