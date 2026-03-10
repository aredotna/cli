import { Box, Text, useInput } from "ink";
import useSWR from "swr";
import { client, getData } from "../api/client";
import { plural, timeAgo } from "../lib/format";
import { openUrl } from "../lib/open";
import { Spinner } from "./Spinner";

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

  useInput((input, key) => {
    if (input === "q" || key.escape) return onBack();
    if (!group) return;

    switch (input) {
      case "c":
        onOpenContents();
        break;
      case "o":
        openUrl(`https://www.are.na/group/${group.slug}`);
        break;
    }
  });

  if (loading) return <Spinner label={`Loading group ${slug}`} />;

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">✕ {error.message}</Text>
        <Text dimColor>q back</Text>
      </Box>
    );
  }

  if (!group) {
    return (
      <Box flexDirection="column">
        <Text dimColor>Group unavailable</Text>
        <Text dimColor>q back</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold>{group.name}</Text>
      <Text dimColor>@{group.slug}</Text>
      {group.bio?.plain ? <Text>{group.bio.plain}</Text> : null}
      <Text dimColor>
        {plural(group.counts.channels, "channel")} ·{" "}
        {plural(group.counts.users, "member")}
      </Text>
      <Text dimColor>Created {timeAgo(group.created_at)}</Text>
      <Box marginTop={1}>
        <Text dimColor>c contents · o browser · q back</Text>
      </Box>
    </Box>
  );
}
