import { Box, Text } from "ink";
import type { Block } from "../api/types";
import { timeAgo } from "../lib/format";
import { blockTextColor } from "../lib/theme";
import { TerminalImage } from "./TerminalImage";

function BlockImagePreview({ block }: { block: Block }) {
  if (!("image" in block)) return null;
  const image = block.image;
  if (!image?.src) return null;

  return <TerminalImage src={image.src} />;
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

function formatFileSize(bytes?: number | null): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

function addRow(
  rows: Array<{ label: string; value: string }>,
  label: string,
  value: string | null | undefined,
) {
  if (!value) return;
  rows.push({ label, value });
}

function BlockMetadata({ block }: { block: Block }) {
  const rows: Array<{ label: string; value: string }> = [];

  addRow(rows, "ID", String(block.id));
  addRow(rows, "Type", block.type);
  addRow(rows, "Added", `${block.created_at} (${timeAgo(block.created_at)})`);
  addRow(
    rows,
    "Modified",
    `${block.updated_at} (${timeAgo(block.updated_at)})`,
  );
  addRow(rows, "By", block.user.name);

  if ("image" in block && block.image) {
    addRow(rows, "Image", block.image.filename);
    if (block.image.width && block.image.height) {
      addRow(
        rows,
        "Dimensions",
        `${block.image.width} × ${block.image.height}`,
      );
    }
    addRow(rows, "Alt text", block.image.alt_text ?? undefined);
  }

  if (block.type === "Attachment" && block.attachment) {
    addRow(rows, "Filename", block.attachment.filename);
    addRow(rows, "Content Type", block.attachment.content_type ?? undefined);
    addRow(rows, "File Size", formatFileSize(block.attachment.file_size));
  }

  if (block.type === "Link" && block.source) {
    addRow(rows, "URL", block.source.url);
    addRow(rows, "Source", block.source.provider?.name ?? undefined);
  }

  if (block.type === "Embed" && block.embed) {
    addRow(rows, "Embed URL", block.embed.url);
    addRow(rows, "Embed type", block.embed.type ?? undefined);
  }

  const labelWidth = rows.reduce(
    (max, row) => Math.max(max, row.label.length),
    0,
  );

  return (
    <Box flexDirection="column">
      {rows.map((row) => (
        <Text key={row.label}>
          <Text dimColor>{`${row.label.padEnd(labelWidth)}  `}</Text>
          {row.value}
        </Text>
      ))}
    </Box>
  );
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

      <Box marginTop={block.title ? 1 : 0} marginBottom={1}>
        <BlockBody block={block} />
      </Box>

      {block.description?.plain && (
        <Box>
          <Text dimColor>{block.description.plain}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <BlockMetadata block={block} />
      </Box>
    </Box>
  );
}
