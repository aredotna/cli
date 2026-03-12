import { Box, Text } from "ink";
import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  type ReactNode,
} from "react";
import { accentColor, brandColor, mutedColor } from "../lib/theme";

export function isWideLayout(minWidth = 104): boolean {
  return (process.stdout.columns ?? 0) >= minWidth;
}

type SessionShellHeaderContextValue = {
  setHeaderOverride: (title: ReactNode | null) => void;
};

const SessionShellHeaderContext =
  createContext<SessionShellHeaderContextValue | null>(null);

export function SessionShellHeaderProvider({
  setHeaderOverride,
  children,
}: {
  setHeaderOverride: (title: ReactNode | null) => void;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ setHeaderOverride }), [setHeaderOverride]);

  return (
    <SessionShellHeaderContext.Provider value={value}>
      {children}
    </SessionShellHeaderContext.Provider>
  );
}

export function useSessionShellHeaderOverride(title?: ReactNode): boolean {
  const context = useContext(SessionShellHeaderContext);

  useLayoutEffect(() => {
    if (!context) return;
    context.setHeaderOverride(title ?? null);
    return () => context.setHeaderOverride(null);
  }, [context, title]);

  return Boolean(context);
}

export function SessionHeader({ title }: { title?: ReactNode }) {
  return (
    <Box marginBottom={1} paddingX={1}>
      <Text bold color="green">
        **
      </Text>
      <Text bold color={brandColor()}>
        {" "}
        Are.na
      </Text>
      {title ? (
        <>
          <Text color={mutedColor()}> / </Text>
          <Text>{title}</Text>
        </>
      ) : null}
    </Box>
  );
}

export function ScreenFrame({
  title,
  children,
}: {
  title?: ReactNode;
  children: ReactNode;
}) {
  const inSessionShell = useContext(SessionShellHeaderContext);

  return (
    <Box flexDirection="column">
      {!inSessionShell ? <SessionHeader title={title} /> : null}

      {children}
    </Box>
  );
}

export function Panel({
  title,
  children,
  width,
}: {
  title?: string;
  children: ReactNode;
  width?: number | string;
}) {
  return (
    <Box flexDirection="column" width={width}>
      {title ? (
        <Box marginBottom={1}>
          <Text color={accentColor()}>{title}</Text>
        </Box>
      ) : null}
      {children}
    </Box>
  );
}

export function KeyHints({
  items,
}: {
  items: Array<{ key: string; label: string }>;
}) {
  return (
    <Text color={mutedColor()}>
      {items.map((item, index) => (
        <Text key={`${item.key}-${item.label}`}>
          {index > 0 ? "  ·  " : ""}
          <Text color={accentColor()}>{item.key}</Text>
          <Text color={mutedColor()}> {item.label}</Text>
        </Text>
      ))}
    </Text>
  );
}
