import { Box, Text, useInput } from "ink";
import { ReactNode } from "react";
import { openUrl } from "../lib/open";
import { ScreenError, ScreenUnavailable } from "./ScreenStates";
import { Spinner } from "./Spinner";

export function EntityProfileScreen({
  name,
  slug,
  bio,
  statsLine,
  metaLine,
  loading,
  loadingLabel,
  errorMessage,
  unavailableLabel,
  browserUrl,
  onBack,
  onOpenContents,
}: {
  name?: string;
  slug?: string;
  bio?: string | null;
  statsLine: ReactNode;
  metaLine?: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
  errorMessage?: string | null;
  unavailableLabel?: string;
  browserUrl?: string;
  onBack: () => void;
  onOpenContents?: () => void;
}) {
  useInput((input, key) => {
    if (input === "q" || key.escape) return onBack();
    if (input === "o" && browserUrl) openUrl(browserUrl);
    if (input === "c" && onOpenContents) onOpenContents();
  });

  if (loading) return <Spinner label={loadingLabel ?? "Loading"} />;
  if (errorMessage) return <ScreenError message={errorMessage} />;
  if (!name || !slug) {
    return (
      <ScreenUnavailable
        message={unavailableLabel ?? "Profile unavailable"}
        backHint="q back"
      />
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold>{name}</Text>
      <Text dimColor>@{slug}</Text>
      {bio ? <Text>{bio}</Text> : null}
      <Text dimColor>{statsLine}</Text>
      {metaLine ? <Text dimColor>{metaLine}</Text> : null}
      <Box marginTop={1}>
        <Text dimColor>
          {onOpenContents ? "c contents · " : ""}
          {browserUrl ? "o browser · " : ""}q back
        </Text>
      </Box>
    </Box>
  );
}
