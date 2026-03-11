import type { ReactNode } from "react";
import type { User } from "../../api/types";
import { BlockViewer } from "../../components/BlockViewer";
import { ChannelsList } from "../../components/ChannelsList";
import { GroupContentsScreen } from "../../components/GroupContentsScreen";
import { GroupProfileScreen } from "../../components/GroupProfileScreen";
import { HomeScreen } from "../../components/HomeScreen";
import { SearchResults } from "../../components/SearchResults";
import type { SessionFooterAction } from "../../components/SessionFooterContext";
import { UserContentsScreen } from "../../components/UserContentsScreen";
import { UserProfileScreen } from "../../components/UserProfileScreen";
import { WhoamiScreen } from "../../components/WhoamiScreen";
import { InteractiveChannel } from "../channel";
import type { SessionView } from "./session-view";

type SessionViewKind = SessionView["kind"];
type ViewFor<K extends SessionViewKind> = Extract<SessionView, { kind: K }>;

export interface SessionViewContext {
  me: User;
  push: (view: SessionView) => void;
  pop: () => void;
  replace: (view: SessionView) => void;
  reset: (view: SessionView) => void;
}

export interface SessionViewConfig<
  K extends SessionViewKind = SessionViewKind,
> {
  render: (args: {
    view: ViewFor<K>;
    context: SessionViewContext;
  }) => ReactNode;
  buildBreadcrumbTitle: (args: { view: ViewFor<K>; me: User }) => string;
  buildBrowserUrl?: (args: { view: ViewFor<K>; me: User }) => string | null;
  footerActions?:
    | SessionFooterAction[]
    | ((args: { view: ViewFor<K>; me: User }) => SessionFooterAction[]);
}

export type SessionViewRegistry = {
  [K in SessionViewKind]: SessionViewConfig<K>;
};

const LIST_FOOTER: SessionFooterAction[] = [
  { key: "j/k", label: "move" },
  { key: "↵", label: "open" },
  { key: "n/p", label: "page" },
  { key: "o", label: "browser" },
  { key: "q/esc", label: "back" },
];

export const SESSION_VIEW_REGISTRY: SessionViewRegistry = {
  home: {
    render: ({ context }) => <HomeScreen me={context.me} />,
    buildBreadcrumbTitle: ({ me }) => me.name,
    footerActions: [
      { key: "↑↓", label: "select" },
      { key: "↵", label: "run" },
      { key: "tab", label: "complete" },
      { key: "esc", label: "clear" },
    ],
  },
  channel: {
    render: ({ view, context }) => (
      <InteractiveChannel
        key={`channel:${view.slug}`}
        slug={view.slug}
        per={24}
        onExit={context.pop}
      />
    ),
    buildBreadcrumbTitle: ({ view }) => view.slug,
    buildBrowserUrl: ({ view }) => `https://www.are.na/channel/${view.slug}`,
    footerActions: [
      { key: "j/k", label: "move" },
      { key: "↵", label: "open" },
      { key: "n/p", label: "page" },
      { key: "a", label: "add" },
      { key: "r", label: "refresh" },
      { key: "o", label: "browser" },
      { key: "q/esc", label: "back" },
    ],
  },
  block: {
    render: ({ view, context }) => (
      <BlockViewer
        key={`block:${view.index}:${view.blockIds.length}`}
        blockIds={view.blockIds}
        index={view.index}
        onBack={context.pop}
        onNavigate={(newIndex) => {
          context.replace({
            kind: "block",
            blockIds: view.blockIds,
            index: newIndex,
          });
        }}
      />
    ),
    buildBreadcrumbTitle: ({ view }) =>
      `Block ${view.blockIds[view.index] ?? "unknown"}`,
    buildBrowserUrl: ({ view }) => {
      const id = view.blockIds[view.index];
      if (!id) return null;
      return `https://www.are.na/block/${id}`;
    },
    footerActions: ({ view }) => [
      ...(view.index > 0 ? [{ key: "←", label: "prev" }] : []),
      ...(view.index < view.blockIds.length - 1
        ? [{ key: "→", label: "next" }]
        : []),
      { key: "o", label: "browser" },
      { key: "q/esc", label: "back" },
    ],
  },
  search: {
    render: ({ view, context }) => (
      <SearchResults
        query={view.query}
        onNavigate={context.push}
        onBack={context.pop}
      />
    ),
    buildBreadcrumbTitle: ({ view }) => `Search / ${view.query}`,
    footerActions: LIST_FOOTER,
  },
  channels: {
    render: ({ context }) => (
      <ChannelsList
        me={context.me}
        onNavigate={context.push}
        onBack={context.pop}
      />
    ),
    buildBreadcrumbTitle: () => "Your channels",
    buildBrowserUrl: ({ me }) => `https://www.are.na/${me.slug}`,
    footerActions: LIST_FOOTER,
  },
  userProfile: {
    render: ({ view, context }) => (
      <UserProfileScreen
        slug={view.slug}
        onOpenContents={() =>
          context.push({ kind: "userContents", slug: view.slug })
        }
        onBack={context.pop}
      />
    ),
    buildBreadcrumbTitle: ({ view }) => `@${view.slug}`,
    buildBrowserUrl: ({ view }) => `https://www.are.na/${view.slug}`,
    footerActions: [
      { key: "c", label: "contents" },
      { key: "o", label: "browser" },
      { key: "q/esc", label: "back" },
    ],
  },
  userContents: {
    render: ({ view, context }) => (
      <UserContentsScreen
        slug={view.slug}
        onNavigate={context.push}
        onBack={context.pop}
      />
    ),
    buildBreadcrumbTitle: ({ view }) => `@${view.slug} / contents`,
    buildBrowserUrl: ({ view }) => `https://www.are.na/${view.slug}`,
    footerActions: LIST_FOOTER,
  },
  groupProfile: {
    render: ({ view, context }) => (
      <GroupProfileScreen
        slug={view.slug}
        onOpenContents={() =>
          context.push({ kind: "groupContents", slug: view.slug })
        }
        onBack={context.pop}
      />
    ),
    buildBreadcrumbTitle: ({ view }) => view.slug,
    buildBrowserUrl: ({ view }) => `https://www.are.na/group/${view.slug}`,
    footerActions: [
      { key: "c", label: "contents" },
      { key: "o", label: "browser" },
      { key: "q/esc", label: "back" },
    ],
  },
  groupContents: {
    render: ({ view, context }) => (
      <GroupContentsScreen
        slug={view.slug}
        onNavigate={context.push}
        onBack={context.pop}
      />
    ),
    buildBreadcrumbTitle: ({ view }) => `${view.slug} / contents`,
    buildBrowserUrl: ({ view }) => `https://www.are.na/group/${view.slug}`,
    footerActions: LIST_FOOTER,
  },
  whoami: {
    render: ({ context }) => (
      <WhoamiScreen me={context.me} onBack={context.pop} />
    ),
    buildBreadcrumbTitle: ({ me }) => me.name,
    buildBrowserUrl: ({ me }) => `https://www.are.na/${me.slug}`,
    footerActions: [
      { key: "o", label: "browser" },
      { key: "q/esc", label: "back" },
    ],
  },
};

export function getSessionViewConfig(view: SessionView): SessionViewConfig {
  return SESSION_VIEW_REGISTRY[view.kind] as SessionViewConfig;
}

export function renderSessionView(
  view: SessionView,
  context: SessionViewContext,
): ReactNode {
  return getSessionViewConfig(view).render({
    view: view as never,
    context,
  });
}

export function buildSessionBreadcrumbTitle(
  view: SessionView,
  me: User,
): string {
  return getSessionViewConfig(view).buildBreadcrumbTitle({
    view: view as never,
    me,
  });
}

export function buildSessionBrowserUrl(
  view: SessionView,
  me: User,
): string | null {
  return (
    getSessionViewConfig(view).buildBrowserUrl?.({
      view: view as never,
      me,
    }) ?? null
  );
}

export function getSessionFooterActions(
  view: SessionView,
  me: User,
): SessionFooterAction[] {
  const actions = getSessionViewConfig(view).footerActions;
  if (!actions) return [];
  if (typeof actions === "function") {
    return actions({ view: view as never, me });
  }
  return actions;
}
