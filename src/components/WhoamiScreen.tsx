import { Box, Text, useInput } from "ink";
import type { User } from "../api/types";
import { plural } from "../lib/format";
import { openUrl } from "../lib/open";

export function WhoamiScreen({ me, onBack }: { me: User; onBack: () => void }) {
  useInput((input, key) => {
    if (input === "q" || key.escape) return onBack();
    if (input === "o") {
      openUrl(`https://www.are.na/${me.slug}`);
    }
  });

  return (
    <Box flexDirection="column">
      <Text bold>{me.name}</Text>
      <Text dimColor>@{me.slug}</Text>
      <Text dimColor>
        {plural(me.counts.channels, "channel")} ·{" "}
        {me.counts.following.toLocaleString()} following ·{" "}
        {plural(me.counts.followers, "follower")}
      </Text>
      <Box marginTop={1}>
        <Text dimColor>o browser · q back</Text>
      </Box>
    </Box>
  );
}
