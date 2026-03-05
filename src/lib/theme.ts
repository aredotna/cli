export const indicators: Record<string, string> = {
  Text: "■",
  Image: "□",
  Link: "◆",
  Attachment: "▲",
  Embed: "●",
  Channel: "◇",
};

export function blockColor(blockType: string): string {
  const colors: Record<string, string> = {
    Text: "white",
    Image: "yellow",
    Link: "cyan",
    Attachment: "magenta",
    Embed: "blue",
    Channel: "green",
  };
  return colors[blockType] || "gray";
}

export function visibilityColor(visibility: string): string {
  const colors: Record<string, string> = {
    public: "green",
    closed: "yellow",
    private: "red",
  };
  return colors[visibility] || "gray";
}

export function visibilityLabel(visibility: string): string {
  const labels: Record<string, string> = {
    public: "open",
    closed: "closed",
    private: "private",
  };
  return labels[visibility] || visibility;
}
