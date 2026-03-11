import { Box, Text, useInput } from "ink";
import { ReactNode } from "react";
import { openUrl } from "../lib/open";
import { useSessionPaletteActive } from "./SessionPaletteContext";
import { ScreenFrame } from "./ScreenChrome";
import { ScreenError, ScreenLoading, ScreenUnavailable } from "./ScreenStates";

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
  const paletteActive = useSessionPaletteActive();

  useInput((input, key) => {
    if (paletteActive) return;
    if (input === "q" || key.escape) return onBack();
    if (input === "o" && browserUrl) openUrl(browserUrl);
    if (input === "c" && onOpenContents) onOpenContents();
  });

  if (loading) return <ScreenLoading label={loadingLabel ?? "Loading"} />;
  if (errorMessage) return <ScreenError message={errorMessage} />;
  if (!name || !slug) {
    return (
      <ScreenUnavailable message={unavailableLabel ?? "Profile unavailable"} />
    );
  }

  return (
    <ScreenFrame title={name}>
      <Box flexDirection="column" paddingX={1}>
        <Text dimColor>@{slug}</Text>
        {bio ? <Text>{bio}</Text> : null}
        <Text dimColor>{statsLine}</Text>
        {metaLine ? <Text dimColor>{metaLine}</Text> : null}
      </Box>
    </ScreenFrame>
  );
}
