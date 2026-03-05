import { Box, Text } from "ink";
import { arena } from "../api/client";
import type { Block, ChannelRef, User } from "../api/types";
import { BlockItem } from "../components/BlockItem";
import { Spinner } from "../components/Spinner";
import { useCommand } from "../hooks/use-command";
import { plural } from "../lib/format";

interface Props {
  query: string;
  page?: number;
  per?: number;
  type?: string;
}

export function SearchCommand({ query, page = 1, per = 24, type }: Props) {
  const { data, error, loading } = useCommand(() =>
    arena.search(query, { page, per, type }),
  );

  if (loading) return <Spinner label={`Searching "${query}"`} />;

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">✕ {error}</Text>
        {error.includes("Forbidden") && (
          <Text dimColor>  Search requires an Are.na Premium subscription</Text>
        )}
      </Box>
    );
  }

  if (!data) return null;

  if (data.data.length === 0) {
    return (
      <Box>
        <Text dimColor>No results for "{query}"</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text dimColor>Results for </Text>
        <Text bold>"{query}"</Text>
      </Box>

      <Box flexDirection="column">
        {data.data.map((item) => {
          if (item.type === "User") {
            const user = item as User;
            return (
              <Box key={`user-${user.id}`}>
                <Text color="white">● </Text>
                <Text>{user.name}</Text>
                <Text dimColor> @{user.slug}</Text>
              </Box>
            );
          }

          if (item.type === "Channel") {
            return (
              <BlockItem
                key={`channel-${item.id}`}
                item={item as ChannelRef}
              />
            );
          }

          return (
            <BlockItem
              key={`block-${item.id}`}
              item={item as Block}
            />
          );
        })}
      </Box>

      {data.meta.total_pages > 1 && (
        <Box marginTop={1}>
          <Text dimColor>
            Page {data.meta.current_page}/{data.meta.total_pages}
            {" · "}
            {plural(data.meta.total_count, "result")}
          </Text>
        </Box>
      )}
    </Box>
  );
}
