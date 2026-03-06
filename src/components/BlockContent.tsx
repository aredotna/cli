import { useEffect, useState } from "react";
import { Box, Text } from "ink";
import type { Block } from "../api/types";
import { timeAgo } from "../lib/format";
import { blockTextColor } from "../lib/theme";
import { TerminalImage } from "./TerminalImage";

function BlockImagePreview({ block }: { block: Block }) {
  if (!("image" in block)) return null;
  const image = block.image;
  if (!image?.src) return null;

  return (
    <>
      <TerminalImage src={image.src} />
      {image.filename && (
        <Text dimColor>
          {image.filename} · {image.width}x{image.height}
        </Text>
      )}
    </>
  );
}

function BlockBody({ block }: { block: Block }) {
  const hasImage = "image" in block;

  switch (block.type) {
    case "Text":
      return block.content.plain ? <Text>{block.content.plain}</Text> : null;

    case "Link":
      return (
        <Box flexDirection="column">
          {hasImage && <BlockImagePreview block={block} />}
          {!block.source ? null : (
            <>
              <Text color="cyan">{block.source.url}</Text>
              {block.source.title && block.source.title !== block.title && (
                <Text dimColor>{block.source.title}</Text>
              )}
            </>
          )}
        </Box>
      );

    case "Image":
      if (!block.image.src) return null;

      return (
        <Box flexDirection="column">
          <TerminalImage src={block.image.src} />
          <Text dimColor>
            {block.image.filename} · {block.image.width}x{block.image.height}
          </Text>
        </Box>
      );

    case "Attachment":
      return (
        <Box flexDirection="column">
          {hasImage && <BlockImagePreview block={block} />}
          {block.attachment ? (
            <Text color="magenta">{block.attachment.filename}</Text>
          ) : null}
        </Box>
      );

    case "Embed":
      return (
        <Box flexDirection="column">
          {hasImage && <BlockImagePreview block={block} />}
          {block.embed ? <Text color="blue">{block.embed.url}</Text> : null}
        </Box>
      );

    default:
      return null;
  }
}

function BlockTypeLabel({ type }: { type: string }) {
  const isPending = type.toLowerCase() === "pendingblock";
  const [dotCount, setDotCount] = useState(1);

  useEffect(() => {
    if (!isPending) return;
    const intervalId = setInterval(() => {
      setDotCount((count) => (count % 3) + 1);
    }, 450);
    return () => clearInterval(intervalId);
  }, [isPending]);

  if (!isPending) return <>{type.toLowerCase()}</>;
  return <>Processing{".".repeat(dotCount)}</>;
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
          <BlockTypeLabel type={block.type} />
        </Text>
      </Box>
    </Box>
  );
}
