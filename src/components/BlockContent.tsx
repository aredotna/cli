import { Box, Text } from "ink";
import type { Block } from "../api/types";
import { timeAgo } from "../lib/format";
import { blockTextColor } from "../lib/theme";
import { TerminalImage } from "./TerminalImage";

function BlockBody({ block }: { block: Block }) {
  switch (block.type) {
    case "Text":
      return block.content?.plain ? <Text>{block.content.plain}</Text> : null;

    case "Link":
      if (!block.source) return null;
      return (
        <Box flexDirection="column">
          <Text color="cyan">{block.source.url}</Text>
          {block.source.title && block.source.title !== block.title && (
            <Text dimColor>{block.source.title}</Text>
          )}
        </Box>
      );

    case "Image":
      if (!block.image?.src) return null;
      return (
        <Box flexDirection="column">
          <TerminalImage src={block.image.src} />
          <Text dimColor>
            {block.image.filename} · {block.image.width}x{block.image.height}
          </Text>
        </Box>
      );

    case "Attachment":
      return block.attachment ? (
        <Text color="magenta">{block.attachment.filename}</Text>
      ) : null;

    case "Embed":
      return block.embed ? <Text color="blue">{block.embed.url}</Text> : null;

    default:
      return null;
  }
}

export function BlockContent({ block }: { block: Block }) {
  const color = blockTextColor();

  return (
    <Box flexDirection="column">
      {block.title && (
        <Text bold color={color}>
          {block.title}
        </Text>
      )}

      <Box marginTop={block.title ? 1 : 0}>
        <BlockBody block={block} />
      </Box>

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
