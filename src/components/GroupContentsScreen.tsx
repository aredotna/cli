import { client, getData } from "../api/client";
import { SessionContentsListScreen } from "./SessionContentsListScreen";

type ContentNavigateView =
  | { kind: "channel"; slug: string }
  | { kind: "block"; blockIds: number[]; index: number };

export function GroupContentsScreen({
  slug,
  onNavigate,
  onBack,
}: {
  slug: string;
  onNavigate: (view: ContentNavigateView) => void;
  onBack: () => void;
}) {
  return (
    <SessionContentsListScreen
      slug={slug}
      swrKeyPrefix="session-group-contents"
      loadingLabel={`Loading group contents for ${slug}`}
      unavailableLabel="Contents unavailable"
      fetchPage={({ slug: id, page, per }) =>
        Promise.all([
          getData(client.GET("/v3/groups/{id}", { params: { path: { id } } })),
          getData(
            client.GET("/v3/groups/{id}/contents", {
              params: { path: { id }, query: { page, per } },
            }),
          ),
        ]).then(([group, contents]) => ({
          name: group.name,
          slug: group.slug,
          items: contents.data,
          meta: contents.meta,
        }))
      }
      onNavigate={onNavigate}
      onBack={onBack}
    />
  );
}
