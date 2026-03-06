import { Text } from "ink";
import { arena } from "../api/client";
import { Spinner } from "../components/Spinner";
import { useCommand } from "../hooks/use-command";

export function PingCommand() {
  const { data, error, loading } = useCommand(() => arena.ping());

  if (loading) return <Spinner label="Pinging" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return (
    <Text color="green">✓ {data.status}</Text>
  );
}
