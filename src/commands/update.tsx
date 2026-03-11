import { spawn } from "node:child_process";
import { Box, Text } from "ink";
import { Spinner } from "../components/Spinner";
import { useCommand } from "../hooks/use-command";
import { CLI_PACKAGE_NAME, getCliVersion } from "../lib/version";

interface UpdateInfo {
  packageName: string;
  current: string;
  latest: string;
  hasUpdate: boolean;
}

async function fetchLatestVersion(packageName: string): Promise<string> {
  const endpoint = `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`;
  const response = await fetch(endpoint);

  if (!response.ok) {
    throw new Error(
      `Failed to check latest version (${response.status} ${response.statusText})`,
    );
  }

  const payload = (await response.json()) as { version?: unknown };
  if (typeof payload.version !== "string" || !payload.version.trim()) {
    throw new Error("Registry response did not include a valid version");
  }

  return payload.version;
}

export async function checkForCliUpdate(): Promise<UpdateInfo> {
  const current = getCliVersion();
  const latest = await fetchLatestVersion(CLI_PACKAGE_NAME);
  return {
    packageName: CLI_PACKAGE_NAME,
    current,
    latest,
    hasUpdate: current !== latest,
  };
}

export async function installLatestCliVersion(): Promise<void> {
  const binary = process.platform === "win32" ? "npm.cmd" : "npm";

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      binary,
      ["install", "-g", `${CLI_PACKAGE_NAME}@latest`],
      {
        stdio: "inherit",
      },
    );

    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`npm install exited with code ${code ?? "unknown"}`));
    });
  });
}

export function UpdateCommand({ apply }: { apply: boolean }) {
  const { data, error, loading } = useCommand(async () => {
    const info = await checkForCliUpdate();
    if (apply && info.hasUpdate) {
      await installLatestCliVersion();
      return { ...info, updated: true };
    }
    return { ...info, updated: false };
  });

  if (loading) {
    return <Spinner label={apply ? "Updating CLI" : "Checking for updates"} />;
  }

  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  if (data.updated) {
    return (
      <Text color="green">
        ✓ Updated {data.packageName} {data.current} → {data.latest}
      </Text>
    );
  }

  if (!data.hasUpdate) {
    return (
      <Text>
        {data.packageName} is up to date (v{data.current})
      </Text>
    );
  }

  return (
    <Box flexDirection="column">
      <Text>
        Update available: {data.current} → {data.latest}
      </Text>
      <Text dimColor>Run `arena update --yes` to install latest globally.</Text>
    </Box>
  );
}
