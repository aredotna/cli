import { client, getData } from "../api/client";
import { SessionContentsListScreen } from "./SessionContentsListScreen";

type ContentNavigateView =
  | { kind: "channel"; slug: string }
  | { kind: "block"; blockIds: number[]; index: number };

export function UserContentsScreen({
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
      swrKeyPrefix="session-user-contents"
      loadingLabel={`Loading contents for ${slug}`}
      unavailableLabel="Contents unavailable"
      fetchPage={({ slug: id, page, per }) =>
        Promise.all([
          getData(client.GET("/v3/users/{id}", { params: { path: { id } } })),
          getData(
            client.GET("/v3/users/{id}/contents", {
              params: { path: { id }, query: { page, per } },
            }),
          ),
        ]).then(([user, contents]) => ({
          name: user.name,
          slug: user.slug,
          items: contents.data,
          meta: contents.meta,
        }))
      }
      onNavigate={onNavigate}
      onBack={onBack}
    />
  );
}
