import type {
  Activity,
  ActivitySubject,
  Followable,
  Notification,
  UserTier,
} from "../api/types";

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

function formatActivityActor(actor: Activity["actor"]): string {
  return `${actor.name} (@${actor.slug})`;
}

function formatActivitySubject(subject: ActivitySubject | null): string {
  if (!subject) return "something";

  switch (subject.type) {
    case "User":
      return `${subject.name} (@${subject.slug})`;
    case "Group":
      return `${subject.name} [group]`;
    case "Channel":
      return `${subject.title} [channel]`;
    case "Comment":
      return subject.body?.plain
        ? `"${truncate(subject.body.plain, 60)}"`
        : "a comment";
    case "Text":
      return (
        subject.title ||
        (subject.content?.plain
          ? truncate(subject.content.plain, 60)
          : "a text block")
      );
    case "Link":
      return subject.title || subject.source?.url || "a link";
    case "Image":
      return subject.title || subject.image?.filename || "an image";
    case "Attachment":
      return subject.title || subject.attachment?.filename || "an attachment";
    case "Embed":
      return (
        subject.title ||
        subject.embed?.title ||
        subject.embed?.url ||
        "an embed"
      );
  }
}

export function formatActivity(activity: Activity | Notification): string {
  const actor = formatActivityActor(activity.actor);
  const item = formatActivitySubject(activity.item);
  const target = formatActivitySubject(activity.target);
  const parent = formatActivitySubject(activity.parent);

  switch (activity.kind) {
    case "followed_user":
      return `${actor} followed ${item}`;
    case "followed_channel":
      return `${actor} followed ${item}`;
    case "followed_group":
      return `${actor} followed ${item}`;
    case "added_block_to_channel":
      return `${actor} added ${item} to ${target}`;
    case "added_channel_to_channel":
      return `${actor} added ${item} to ${target}`;
    case "created_channel":
      return `${actor} created ${item}`;
    case "collaborating_with_user_on_channel":
      return `${actor} is collaborating with ${item} on ${target}`;
    case "collaborating_with_group_on_channel":
      return `${actor} is collaborating with ${item} on ${target}`;
    case "commented_on_block":
      return `${actor} commented ${item} on ${target} in ${parent}`;
    case "mentioned_you":
      return `${actor} mentioned you in ${parent}`;
    case "added_user_to_group":
      return `${actor} added ${item} to ${target}`;
  }
}

const TIER_LABELS: Record<UserTier, string> = {
  premium: "Premium",
  supporter: "Supporter",
  free: "Free",
  guest: "Guest",
};

export function formatTier(tier: UserTier): string {
  return TIER_LABELS[tier] ?? tier;
}

export function isPremium(tier: UserTier): boolean {
  return tier === "premium" || tier === "supporter";
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
