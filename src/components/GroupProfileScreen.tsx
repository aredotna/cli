import useSWR from "swr";
import { client, getData } from "../api/client";
import { plural, timeAgo } from "../lib/format";
import { EntityProfileScreen } from "./EntityProfileScreen";

export function GroupProfileScreen({
  slug,
  onOpenContents,
  onBack,
}: {
  slug: string;
  onOpenContents: () => void;
  onBack: () => void;
}) {
  const {
    data: group,
    error,
    isLoading: loading,
  } = useSWR(`session-group-profile:${slug}`, () =>
    getData(client.GET("/v3/groups/{id}", { params: { path: { id: slug } } })),
  );

  return (
    <EntityProfileScreen
      name={group?.name}
      slug={group?.slug}
      bio={group?.bio?.plain}
      statsLine={
        group
          ? `${plural(group.counts.channels, "channel")} · ${plural(group.counts.users, "member")}`
          : ""
      }
      metaLine={
        group?.created_at ? `Created ${timeAgo(group.created_at)}` : undefined
      }
      loading={loading}
      loadingLabel={`Loading group ${slug}`}
      errorMessage={error?.message}
      unavailableLabel="Group unavailable"
      browserUrl={
        group?.slug ? `https://www.are.na/group/${group.slug}` : undefined
      }
      onBack={onBack}
      onOpenContents={onOpenContents}
    />
  );
}
