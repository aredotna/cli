import { readFileSync } from "fs";
import { basename } from "path";
import { Box, Text } from "ink";
import { arena } from "../api/client";
import { Spinner } from "../components/Spinner";
import { useCommand } from "../hooks/use-command";

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  mp4: "video/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  txt: "text/plain",
  md: "text/markdown",
};

function getMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_MIME[ext] ?? "application/octet-stream";
}

interface Props {
  file: string;
  channel: string;
  title?: string;
  description?: string;
}

export function UploadCommand({ file, channel, title, description }: Props) {
  const { data, error, loading } = useCommand(async () => {
    const filename = basename(file);
    const contentType = getMimeType(filename);
    const fileBuffer = readFileSync(file);

    const presigned = await arena.presignUpload([
      { filename, content_type: contentType },
    ]);

    const uploadTarget = presigned.files[0]!;
    const putResponse = await fetch(uploadTarget.upload_url, {
      method: "PUT",
      headers: { "Content-Type": uploadTarget.content_type },
      body: fileBuffer,
    });

    if (!putResponse.ok) {
      throw new Error(`Upload failed (${putResponse.status})`);
    }

    const s3Url = `https://s3.amazonaws.com/arena_images-temp/${uploadTarget.key}`;
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
          <Text dimColor>  Run `arena login` to authenticate</Text>
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
