import { basename } from "path";
import { Box, Text } from "ink";
import { arena } from "../api/client";
import { Spinner } from "../components/Spinner";
import { useCommand } from "../hooks/use-command";
import { uploadLocalFile } from "../lib/upload";

interface Props {
  file: string;
  channel: string;
  title?: string;
  description?: string;
}

export function UploadCommand({ file, channel, title, description }: Props) {
  const { data, error, loading } = useCommand(async () => {
    const { s3Url } = await uploadLocalFile(file);
    const ch = await arena.getChannel(channel);
    const block = await arena.createBlock(s3Url, [ch.id], {
      title,
      description,
    });

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
