import { Box, Text } from "ink";
import { accentColor, dockTextColor, mutedColor } from "../lib/theme";
import type { SessionFooterAction } from "./SessionFooterContext";

export function SessionFooter({ actions }: { actions: SessionFooterAction[] }) {
  if (actions.length === 0) return null;

  return (
    <Box paddingX={1} paddingBottom={1}>
      <Text color={dockTextColor() ?? mutedColor()}>
        {actions.map((action, index) => (
          <Text key={`${action.key}-${action.label}`}>
            {index > 0 ? "  " : ""}
            <Text color={accentColor()}>{action.key}</Text>
            <Text color={dockTextColor() ?? mutedColor()}> {action.label}</Text>
          </Text>
        ))}
      </Text>
    </Box>
  );
}
