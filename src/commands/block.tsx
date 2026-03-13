import { Box, Text } from "ink";
import { client, getData } from "../api/client";
import type { ConnectionSort } from "../api/types";
import { BlockContent } from "../components/BlockContent";
import { Spinner } from "../components/Spinner";
import { useCommand } from "../hooks/use-command";
import { plural } from "../lib/format";

export function BlockCommand({ id }: { id: number }) {
  const { data, error, loading } = useCommand(() =>
    getData(
      client.GET("/v3/blocks/{id}", {
        params: { path: { id } },
      }),
    ),
  );

  if (loading) return <Spinner label={`Loading block ${id}`} />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return <BlockContent block={data} />;
}

export function BlockUpdateCommand({
  id,
  title,
  description,
  content,
  altText,
}: {
  id: number;
  title?: string;
  description?: string;
  content?: string;
  altText?: string;
}) {
  const { data, error, loading } = useCommand(() =>
    getData(
      client.PUT("/v3/blocks/{id}", {
        params: { path: { id } },
        body: { title, description, content, alt_text: altText },
      }),
    ),
  );

  if (loading) return <Spinner label="Updating block" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return (
    <Box>
      <Text color="green">✓ </Text>
      <Text>Updated block {data.id}</Text>
      {data.title && <Text dimColor> — {data.title}</Text>}
    </Box>
  );
}

export function BlockCommentsCommand({
  id,
  page = 1,
  per,
  sort,
}: {
  id: number;
  page?: number;
  per?: number;
  sort?: ConnectionSort;
}) {
  const { data, error, loading } = useCommand(() =>
    getData(
      client.GET("/v3/blocks/{id}/comments", {
        params: { path: { id }, query: { page, per, sort } },
      }),
    ),
  );

  if (loading) return <Spinner label="Loading comments" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  if (data.data.length === 0) {
    return <Text dimColor>No comments</Text>;
  }

  return (
    <Box flexDirection="column">
      {data.data.map((c) => (
        <Box key={c.id} flexDirection="column" marginBottom={1}>
          <Text>
            <Text bold>{c.user.name}</Text>
            <Text dimColor> · {c.id}</Text>
          </Text>
          {c.body?.plain && <Text>{c.body.plain}</Text>}
        </Box>
      ))}
      <Text dimColor>
        Page {data.meta.current_page}/{data.meta.total_pages} ·{" "}
        {plural(data.meta.total_count, "comment")}
      </Text>
    </Box>
  );
}
