import { Box, Text } from "ink";

export function ScreenError({
  message,
  backHint = "q back",
}: {
  message: string;
  backHint?: string;
}) {
  return (
    <Box flexDirection="column">
      <Text color="red">✕ {message}</Text>
      <Text dimColor>{backHint}</Text>
    </Box>
  );
}

export function ScreenEmpty({
  message,
  backHint = "q back",
}: {
  message: string;
  backHint?: string;
}) {
  return (
    <Box flexDirection="column">
      <Text dimColor>{message}</Text>
      <Text dimColor>{backHint}</Text>
    </Box>
  );
}

export function ScreenUnavailable({
  message,
  backHint = "q back",
}: {
  message: string;
  backHint?: string;
}) {
  return (
    <Box flexDirection="column">
      <Text dimColor>{message}</Text>
      <Text dimColor>{backHint}</Text>
    </Box>
  );
}
