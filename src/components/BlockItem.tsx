import { Box, Text } from "ink";
import type { Block, ChannelRef, Connectable } from "../api/types";
import { blockColor, indicators } from "../lib/theme";
import { truncate } from "../lib/format";

function isChannelRef(item: Connectable): item is ChannelRef {
  return "counts" in item && item.type === "Channel";
}

function getLabel(block: Block): string {
  if (block.title) return block.title;

  switch (block.type) {
    case "Text":
      return block.content?.plain?.replace(/\n/g, " ").trim() || "Untitled";
    case "Link":
      return block.source?.url || "Untitled";
    case "Image":
      return block.image?.filename || "Untitled";
    case "Attachment":
      return block.attachment?.file_name || "Untitled";
    case "Embed":
      return block.embed?.title || block.embed?.url || "Untitled";
    default:
      return "Untitled";
  }
}

interface Props {
  item: Connectable;
  selected?: boolean;
}

export function BlockItem({ item, selected = false }: Props) {
  const indicator = indicators[item.type] || "·";
  const color = blockColor(item.type);
  const prefix = selected ? "▸ " : "  ";

  if (isChannelRef(item)) {
    return (
      <Box>
        <Text color={selected ? "cyan" : undefined}>{prefix}</Text>
        <Text color={color} bold={selected}>
          {indicator}{" "}
        </Text>
        <Text color={color} bold={selected}>
          {truncate(item.title, 60)}
        </Text>
        <Text dimColor> ({item.counts.contents})</Text>
      </Box>
    );
  }

  const label = getLabel(item);

  return (
    <Box>
      <Text color={selected ? "cyan" : undefined}>{prefix}</Text>
      <Text color={color} bold={selected}>
        {indicator}{" "}
      </Text>
      <Text bold={selected}>{truncate(label, 60)}</Text>
    </Box>
  );
}
