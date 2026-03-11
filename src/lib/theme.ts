export const INDICATORS: Record<string, string> = {
  Text: "≡",
  Image: "▣",
  Link: "↗",
  Attachment: "▲",
  Embed: "▷",
  Channel: "□",
};

type Tone = "light" | "dark" | "unknown";

type ThemeColors = {
  neutral: string | undefined;
  muted: string;
  brand: string;
  accent: string;
  panel: string;
  dockBg: string;
  dockPromptBg: string;
  dockText: string | undefined;
  channel: Record<"public" | "closed" | "private", string>;
  blockIcon: Record<string, string>;
};

function detectTerminalTone(): Tone {
  const forced = process.env["ARENA_TERM_THEME"]?.toLowerCase();
  if (forced === "light" || forced === "dark") return forced;

  // Common in many terminals: "<fg>;<bg>" or "<...>;<bg>".
  // We only use this as a heuristic and fall back to unknown.
  const fgBg = process.env["COLORFGBG"];
  if (!fgBg) return "unknown";
  const parts = fgBg
    .split(";")
    .map((p) => Number.parseInt(p, 10))
    .filter((n) => Number.isFinite(n));
  const bg = parts[parts.length - 1];
  if (bg === undefined) return "unknown";
  if (bg >= 0 && bg <= 6) return "dark";
  if (bg >= 7 && bg <= 15) return "light";
  return "unknown";
}

const THEMES: Record<Tone, ThemeColors> = {
  // Based on web token intent:
  // - channelPublic3 -> green
  // - channelPrivate3 -> red
  // - channelClosed3 -> gray
  dark: {
    neutral: "white",
    muted: "gray",
    brand: "greenBright",
    accent: "yellowBright",
    panel: "gray",
    dockBg: "#131416",
    dockPromptBg: "#232529",
    dockText: "white",
    channel: {
      public: "greenBright",
      closed: "gray",
      private: "redBright",
    },
    blockIcon: {
      Text: "gray",
      Image: "blueBright",
      Link: "cyanBright",
      Attachment: "magentaBright",
      Embed: "yellowBright",
    },
  },
  light: {
    neutral: "black",
    muted: "gray",
    brand: "green",
    accent: "yellow",
    panel: "gray",
    dockBg: "#ece7df",
    dockPromptBg: "#ddd6cb",
    dockText: "black",
    channel: {
      public: "green",
      closed: "gray",
      private: "red",
    },
    blockIcon: {
      Text: "gray",
      Image: "blue",
      Link: "cyan",
      Attachment: "magenta",
      Embed: "yellow",
    },
  },
  unknown: {
    // Let terminal default text color win if we can't confidently detect.
    neutral: undefined,
    muted: "gray",
    brand: "green",
    accent: "yellow",
    panel: "gray",
    dockBg: "#131416",
    dockPromptBg: "#232529",
    dockText: "white",
    channel: {
      public: "green",
      closed: "gray",
      private: "red",
    },
    blockIcon: {
      Text: "gray",
      Image: "blue",
      Link: "cyan",
      Attachment: "magenta",
      Embed: "yellow",
    },
  },
};

const ACTIVE_THEME = THEMES[detectTerminalTone()];

export function blockTextColor(): string | undefined {
  return ACTIVE_THEME.neutral;
}

export function mutedColor(): string {
  return ACTIVE_THEME.muted;
}

export function brandColor(): string {
  return ACTIVE_THEME.brand;
}

export function accentColor(): string {
  return ACTIVE_THEME.accent;
}

export function panelBorderColor(): string {
  return ACTIVE_THEME.panel;
}

export function dockBackgroundColor(): string {
  return ACTIVE_THEME.dockBg;
}

export function dockPromptBackgroundColor(): string {
  return ACTIVE_THEME.dockPromptBg;
}

export function dockTextColor(): string | undefined {
  return ACTIVE_THEME.dockText;
}

export function blockIconColor(blockType: string): string {
  return ACTIVE_THEME.blockIcon[blockType] || "gray";
}

export function channelColor(visibility: string): string {
  const channel = ACTIVE_THEME.channel;
  if (visibility === "public") return channel.public;
  if (visibility === "closed") return channel.closed;
  if (visibility === "private") return channel.private;
  return "gray";
}

// Backward-compatible name used in older components.
export function blockColor(): string {
  return blockTextColor() ?? "gray";
}

export function visibilityLabel(visibility: string): string {
  const labels: Record<string, string> = {
    public: "open",
    closed: "closed",
    private: "private",
  };
  return labels[visibility] || visibility;
}
