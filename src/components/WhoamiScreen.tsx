import type { User } from "../api/types";
import { plural } from "../lib/format";
import { EntityProfileScreen } from "./EntityProfileScreen";

export function WhoamiScreen({ me, onBack }: { me: User; onBack: () => void }) {
  return (
    <EntityProfileScreen
      name={me.name}
      slug={me.slug}
      statsLine={`${plural(me.counts.channels, "channel")} · ${me.counts.following.toLocaleString()} following · ${plural(me.counts.followers, "follower")}`}
      browserUrl={`https://www.are.na/${me.slug}`}
      onBack={onBack}
    />
  );
}
