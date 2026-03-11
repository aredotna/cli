import { clampBlockIndex } from "../../lib/session-nav";

export type SessionView =
  | { kind: "home" }
  | { kind: "channel"; slug: string }
  | { kind: "block"; blockIds: number[]; index: number }
  | { kind: "search"; query: string }
  | { kind: "channels" }
  | { kind: "userProfile"; slug: string }
  | { kind: "userContents"; slug: string }
  | { kind: "groupProfile"; slug: string }
  | { kind: "groupContents"; slug: string }
  | { kind: "whoami" };

export function normalizeView(view: SessionView): SessionView {
  switch (view.kind) {
    case "block": {
      const index = clampBlockIndex(view.index, view.blockIds.length);
      if (index === null) return { kind: "home" };
      if (index === view.index) return view;
      return { ...view, index };
    }
    case "channel":
    case "userProfile":
    case "userContents":
    case "groupProfile":
    case "groupContents":
      if (!view.slug?.trim()) return { kind: "home" };
      return view;
    default:
      return view;
  }
}

export function isSameView(a: SessionView, b: SessionView): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "block" && b.kind === "block") {
    if (a.index !== b.index) return false;
    if (a.blockIds.length !== b.blockIds.length) return false;
    return a.blockIds.every((id, i) => id === b.blockIds[i]);
  }
  if ("slug" in a && "slug" in b) return a.slug === b.slug;
  if ("query" in a && "query" in b) return a.query === b.query;
  return true;
}
