import { basename } from "path";
import { Box, Text } from "ink";
import { client, getData } from "../api/client";
import { Spinner } from "../components/Spinner";
import { useCommand } from "../hooks/use-command";
import { uploadLocalFile } from "../lib/upload";
import { Metadata } from "../api/types";

interface Props {
  file: string;
  channel: string;
  title?: string;
  description?: string;
  altText?: string;
  originalSourceUrl?: string;
  originalSourceTitle?: string;
  insertAt?: number;
  metadata?: Metadata;
  connectionMetadata?: Metadata;
}

export function UploadCommand({
  file,
  channel,
  title,
  description,
  altText,
  originalSourceUrl,
  originalSourceTitle,
  insertAt,
  metadata,
  connectionMetadata,
}: Props) {
  const { data, error, loading } = useCommand(async () => {
    const { s3Url } = await uploadLocalFile(file);
    const ch = await getData(
      client.GET("/v3/channels/{id}", {
        params: { path: { id: channel } },
      }),
    );
    const block = await getData(
      client.POST("/v3/blocks", {
        body: {
          value: s3Url,
          channels: [
            {
              id: ch.id,
              position: insertAt,
              metadata: connectionMetadata,
            },
          ],
          title,
          description,
          alt_text: altText,
          original_source_url: originalSourceUrl,
          original_source_title: originalSourceTitle,
          metadata,
        },
      }),
    );

    return { block, channel: ch };
  });

  if (loading) return <Spinner label={`Uploading ${basename(file)}`} />;

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
      <Text>Uploaded to </Text>
      <Text bold>{data.channel.title}</Text>
    </Box>
  );
}
