import { useState, useEffect } from "react";
import { Text } from "ink";

const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function Spinner({ label }: { label?: string }) {
  const animate = Boolean(process.stdout.isTTY);
  const [i, setI] = useState(0);

  useEffect(() => {
    if (!animate) return;
    const timer = setInterval(() => {
      setI((prev) => (prev + 1) % frames.length);
    }, 80);
    return () => clearInterval(timer);
  }, [animate]);

  return (
    <Text>
      <Text color="cyan">{animate ? frames[i] : "…"}</Text>
      {label && <Text dimColor> {label}</Text>}
    </Text>
  );
}
