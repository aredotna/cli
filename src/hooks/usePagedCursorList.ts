import { useCallback, useState } from "react";
import { wrapIndex } from "../lib/session-nav";

export function usePagedCursorList({
  initialPage = 1,
  initialCursor = 0,
}: {
  initialPage?: number;
  initialCursor?: number;
}) {
  const [page, setPage] = useState(initialPage);
  const [cursor, setCursor] = useState(initialCursor);

  const clampCursor = useCallback((itemCount: number) => {
    setCursor((value) =>
      itemCount > 0 && value >= itemCount ? itemCount - 1 : value,
    );
  }, []);

  const moveUp = useCallback((itemCount: number) => {
    setCursor((value) => wrapIndex(value, itemCount, -1));
  }, []);

  const moveDown = useCallback((itemCount: number) => {
    setCursor((value) => wrapIndex(value, itemCount, 1));
  }, []);

  const nextPage = useCallback(() => {
    setPage((value) => value + 1);
    setCursor(0);
  }, []);

  const prevPage = useCallback(() => {
    setPage((value) => Math.max(1, value - 1));
    setCursor(0);
  }, []);

  return {
    page,
    setPage,
    cursor,
    setCursor,
    clampCursor,
    moveUp,
    moveDown,
    nextPage,
    prevPage,
  };
}
