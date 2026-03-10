import { Box, Text, useInput } from "ink";
import useSWR from "swr";
import { client, getData } from "../api/client";
import { plural, timeAgo } from "../lib/format";
import { openUrl } from "../lib/open";
import { Spinner } from "./Spinner";

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

  useInput((input, key) => {
    if (input === "q" || key.escape) return onBack();
    if (!user) return;

    switch (input) {
      case "c":
        onOpenContents();
        break;
      case "o":
        openUrl(`https://www.are.na/${user.slug}`);
        break;
    }
  });

  if (loading) return <Spinner label={`Loading user ${slug}`} />;

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">✕ {error.message}</Text>
        <Text dimColor>q back</Text>
      </Box>
    );
  }

  if (!user) {
    return (
      <Box flexDirection="column">
        <Text dimColor>User unavailable</Text>
        <Text dimColor>q back</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold>{user.name}</Text>
      <Text dimColor>@{user.slug}</Text>
      {user.bio?.plain ? <Text>{user.bio.plain}</Text> : null}
      <Text dimColor>
        {plural(user.counts.channels, "channel")} ·{" "}
        {user.counts.following.toLocaleString()} following ·{" "}
        {plural(user.counts.followers, "follower")}
      </Text>
      {user.created_at ? (
        <Text dimColor>Joined {timeAgo(user.created_at)}</Text>
      ) : null}
      <Box marginTop={1}>
        <Text dimColor>c contents · o browser · q back</Text>
      </Box>
    </Box>
  );
}
