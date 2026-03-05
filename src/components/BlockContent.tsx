import { Box, Text } from "ink";
import type { Block } from "../api/types";
import { timeAgo } from "../lib/format";
import { blockColor } from "../lib/theme";
import { TerminalImage } from "./TerminalImage";

export function BlockContent({ block }: { block: Block }) {
  const color = blockColor(block.type);

  return (
    <Box flexDirection="column">
      {block.title && (
        <Text bold color={color}>
          {block.title}
        </Text>
      )}

      {block.type === "Text" && block.content?.plain && (
        <Box marginTop={block.title ? 1 : 0}>
          <Text>{block.content.plain}</Text>
        </Box>
      )}

      {block.type === "Link" && block.source && (
        <Box flexDirection="column" marginTop={block.title ? 1 : 0}>
          <Text color="cyan">{block.source.url}</Text>
          {block.source.title && block.source.title !== block.title && (
            <Text dimColor>{block.source.title}</Text>
          )}
        </Box>
      )}

      {block.type === "Image" && block.image && (
        <Box flexDirection="column" marginTop={block.title ? 1 : 0}>
          <TerminalImage src={block.image.src} />
          <Text dimColor>
            {block.image.filename} · {block.image.width}x{block.image.height}
          </Text>
        </Box>
      )}

      {block.type === "Attachment" && block.attachment && (
        <Box marginTop={block.title ? 1 : 0}>
          <Text color="magenta">{block.attachment.file_name}</Text>
        </Box>
      )}

      {block.type === "Embed" && block.embed && (
        <Box marginTop={block.title ? 1 : 0}>
          <Text color="blue">{block.embed.url}</Text>
        </Box>
      )}

      {block.description?.plain && (
        <Box marginTop={1}>
          <Text dimColor>{block.description.plain}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>
          {block.user.name} · {timeAgo(block.created_at)} ·{" "}
          {block.type.toLowerCase()}
        </Text>
      </Box>
    </Box>
  );
}
