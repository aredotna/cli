import { Box, Text } from "ink";
import { Spinner } from "../components/Spinner";
import { useCommand } from "../hooks/use-command";
import { config } from "../lib/config";

export function LogoutCommand() {
  const { data, error, loading } = useCommand(async () => {
    const hadToken = !!config.getToken();
    config.clearToken();
    return { hadToken };
  });

  if (loading) return <Spinner label="Logging out" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  if (!data.hadToken) {
    return <Text dimColor>Not logged in</Text>;
  }

  return (
    <Box>
      <Text color="green">✓ </Text>
      <Text>Logged out — token removed from {config.getConfigPath()}</Text>
    </Box>
  );
}
