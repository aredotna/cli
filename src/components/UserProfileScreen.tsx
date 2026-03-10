import useSWR from "swr";
import { client, getData } from "../api/client";
import { plural, timeAgo } from "../lib/format";
import { EntityProfileScreen } from "./EntityProfileScreen";

export function UserProfileScreen({
  slug,
  onOpenContents,
  onBack,
}: {
  slug: string;
  onOpenContents: () => void;
  onBack: () => void;
}) {
  const {
    data: user,
    error,
    isLoading: loading,
  } = useSWR(`session-user-profile:${slug}`, () =>
    getData(client.GET("/v3/users/{id}", { params: { path: { id: slug } } })),
  );

  return (
    <EntityProfileScreen
      name={user?.name}
      slug={user?.slug}
      bio={user?.bio?.plain}
      statsLine={
        user
          ? `${plural(user.counts.channels, "channel")} · ${user.counts.following.toLocaleString()} following · ${plural(user.counts.followers, "follower")}`
          : ""
      }
      metaLine={
        user?.created_at ? `Joined ${timeAgo(user.created_at)}` : undefined
      }
      loading={loading}
      loadingLabel={`Loading user ${slug}`}
      errorMessage={error?.message}
      unavailableLabel="User unavailable"
      browserUrl={user?.slug ? `https://www.are.na/${user.slug}` : undefined}
      onBack={onBack}
      onOpenContents={onOpenContents}
    />
  );
}
