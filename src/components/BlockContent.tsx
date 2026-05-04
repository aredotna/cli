import { useMemo } from "react";
import { Box, Text } from "ink";
import type { Block } from "../api/types";
import { formatFileSize, timeAgo } from "../lib/format";
import { formatMetadata } from "../lib/metadata";
import { blockTextColor } from "../lib/theme";
import { TerminalImage } from "./TerminalImage";

export function BlockContent({
  block,
  showTitle = true,
}: {
  block: Block;
  showTitle?: boolean;
}) {
  const color = blockTextColor();
  const previewImage = "image" in block ? block.image : null;
  const previewSrc = previewImage?.small?.src ?? previewImage?.src;

  const body =
    block.type === "Text" ? (
      block.content?.plain ? (
        <Text>{block.content.plain}</Text>
      ) : null
    ) : block.type === "Link" ? (
      <Box flexDirection="column">
        {previewSrc ? <TerminalImage src={previewSrc} /> : null}
        {block.source ? (
          <>
            <Text color="cyan">{block.source.url}</Text>
            {block.source.title && block.source.title !== block.title && (
              <Text dimColor>{block.source.title}</Text>
            )}
          </>
        ) : null}
      </Box>
    ) : block.type === "Image" ? (
      previewSrc ? (
        <Box flexDirection="column">
          <TerminalImage src={previewSrc} />
        </Box>
      ) : null
    ) : block.type === "Attachment" ? (
      <Box flexDirection="column">
        {previewSrc ? <TerminalImage src={previewSrc} /> : null}
        {block.attachment ? (
          <Text color="magenta">{block.attachment.filename}</Text>
        ) : null}
      </Box>
    ) : block.type === "Embed" ? (
      <Box flexDirection="column">
        {previewSrc ? <TerminalImage src={previewSrc} /> : null}
        {block.embed ? <Text color="blue">{block.embed.url}</Text> : null}
      </Box>
    ) : null;

  const rows = useMemo(() => {
    const dimensionValue =
      previewImage?.width && previewImage?.height
        ? `${previewImage.width} × ${previewImage.height}`
        : null;

    const candidates: Array<{
      label: string;
      value: string | null | undefined;
    }> = [
      { label: "ID", value: String(block.id) },
      { label: "Type", value: block.type },
      {
        label: "Added",
        value: `${block.created_at} (${timeAgo(block.created_at)})`,
      },
      {
        label: "Modified",
        value: `${block.updated_at} (${timeAgo(block.updated_at)})`,
      },
      { label: "By", value: block.user.name },
      { label: "Metadata", value: formatMetadata(block.metadata) },
      ...(previewImage
        ? [
            { label: "Image", value: previewImage.filename },
            { label: "Dimensions", value: dimensionValue },
            { label: "Alt text", value: previewImage.alt_text },
          ]
        : []),
      ...(block.type === "Attachment" && block.attachment
        ? [
            { label: "Filename", value: block.attachment.filename },
            { label: "Content Type", value: block.attachment.content_type },
            {
              label: "File Size",
              value: formatFileSize(block.attachment.file_size),
            },
          ]
        : []),
      ...(block.type === "Link" && block.source
        ? [
            { label: "URL", value: block.source.url },
            { label: "Source", value: block.source.provider?.name },
          ]
        : []),
      ...(block.type === "Embed" && block.embed
        ? [
            { label: "Embed URL", value: block.embed.url },
            { label: "Embed type", value: block.embed.type },
          ]
        : []),
    ];

    return candidates.filter(
      (candidate): candidate is { label: string; value: string } =>
        Boolean(candidate.value),
    );
  }, [block, previewImage]);

  const labelWidth = rows.reduce(
    (max, row) => Math.max(max, row.label.length),
    0,
  );

  return (
    <Box flexDirection="column">
      {showTitle && block.title && (
        <Text bold color={color}>
          {block.title}
        </Text>
      )}

      <Box marginTop={showTitle && block.title ? 1 : 0} marginBottom={1}>
        {body}
      </Box>

      {block.description?.plain && (
        <Box>
          <Text dimColor>{block.description.plain}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Box flexDirection="column">
          {rows.map((row) => (
            <Text key={`${row.label}:${row.value}`}>
              <Text dimColor>{`${row.label.padEnd(labelWidth)}  `}</Text>
              {row.value}
            </Text>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
