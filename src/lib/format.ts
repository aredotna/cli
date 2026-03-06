import type { Followable } from "../api/types";

export function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

export function truncate(str: string, max: number): string {
  const clean = str.replace(/\n/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1) + "…";
}

export function plural(n: number, word: string): string {
  return `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
}

export function formatCounts(data: {
  counts?: { channels: number; followers: number; following: number };
  channel_count?: number;
  follower_count?: number;
  following_count?: number;
}): string {
  if (data.counts) {
    return [
      plural(data.counts.channels, "channel"),
      plural(data.counts.followers, "follower"),
      `${data.counts.following} following`,
    ].join(" · ");
  }

  return [
    data.channel_count !== undefined
      ? plural(data.channel_count, "channel")
      : null,
    data.follower_count !== undefined
      ? plural(data.follower_count, "follower")
      : null,
    data.following_count !== undefined
      ? `${data.following_count} following`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function formatFollowable(item: Followable): string {
  switch (item.type) {
    case "User":
      return `${item.name} (@${item.slug})`;
    case "Channel":
      return `${item.title} [channel]`;
    case "Group":
      return `${item.name} [group]`;
  }
}

export function formatFileSize(bytes?: number | null): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}
