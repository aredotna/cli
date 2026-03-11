import { Text } from "ink";
import { CLI_PACKAGE_NAME, getCliVersion } from "../lib/version";

export function VersionCommand() {
  return (
    <Text>
      {CLI_PACKAGE_NAME} v{getCliVersion()}
    </Text>
  );
}
