import { Box, Text } from "ink";
import { useMemo, type ReactNode } from "react";
import { ScreenFrame, useSessionShellHeaderOverride } from "./ScreenChrome";
import { Spinner } from "./Spinner";

export function ScreenError({
  title = "Error",
  message,
}: {
  title?: ReactNode;
  message: string;
}) {
  const inSessionShell = useSessionShellHeaderOverride(title);

  if (inSessionShell) {
    return (
      <Box paddingX={1}>
        <Text color="red">✕ {message}</Text>
      </Box>
    );
  }

  return (
    <ScreenFrame title={title}>
      <Box paddingX={1}>
        <Text color="red">✕ {message}</Text>
      </Box>
    </ScreenFrame>
  );
}

export function ScreenLoading({ label }: { label: string }) {
  const loadingTitle = useMemo(() => <Spinner label={label} />, [label]);
  const inSessionShell = useSessionShellHeaderOverride(loadingTitle);

  if (inSessionShell) return <Box />;

  return (
    <ScreenFrame title={<Spinner label={label} />}>
      <Box />
    </ScreenFrame>
  );
}

export function ScreenEmpty({ message }: { message: string }) {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text dimColor>{message}</Text>
    </Box>
  );
}

export function ScreenUnavailable({ message }: { message: string }) {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text dimColor>{message}</Text>
    </Box>
  );
}
