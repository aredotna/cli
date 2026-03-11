import { useEffect } from "react";
import { useInput } from "ink";
import type { Dispatch, SetStateAction } from "react";

export interface ListControllerState {
  page: number;
  cursor: number;
}

export interface ListControllerHandlers {
  setPage: Dispatch<SetStateAction<number>>;
  setCursor: Dispatch<SetStateAction<number>>;
  clampCursor: (itemCount: number) => void;
  moveUp: (itemCount: number) => void;
  moveDown: (itemCount: number) => void;
  nextPage: () => void;
  prevPage: () => void;
}

export interface ListControllerOptions {
  state: ListControllerState;
  handlers: ListControllerHandlers;
  itemCount: number;
  loading?: boolean;
  paletteActive: boolean;
  canNextPage: (state: ListControllerState) => boolean;
  canPrevPage?: (state: ListControllerState) => boolean;
  onOpen: (index: number) => void;
  onBack: () => void;
  onOpenBrowser?: (index: number) => void;
}

export function useSessionListNavigation({
  state,
  handlers,
  itemCount,
  loading,
  paletteActive,
  canNextPage,
  canPrevPage,
  onOpen,
  onBack,
  onOpenBrowser,
}: ListControllerOptions): {
  state: ListControllerState;
  handlers: ListControllerHandlers;
} {
  const { clampCursor, moveUp, moveDown, nextPage, prevPage } = handlers;

  useEffect(() => {
    clampCursor(itemCount);
  }, [clampCursor, itemCount]);

  useInput((input, key) => {
    if (paletteActive) return;
    if (input === "q" || key.escape) {
      onBack();
      return;
    }
    if (loading) return;

    switch (true) {
      case key.upArrow || input === "k":
        moveUp(itemCount);
        break;
      case key.downArrow || input === "j":
        moveDown(itemCount);
        break;
      case key.return && itemCount > 0:
        onOpen(state.cursor);
        break;
      case (key.rightArrow || input === "n") && canNextPage(state):
        nextPage();
        break;
      case (key.leftArrow || input === "p") &&
        (canPrevPage?.(state) ?? state.page > 1):
        prevPage();
        break;
      case input === "o" && itemCount > 0 && !!onOpenBrowser:
        onOpenBrowser(state.cursor);
        break;
    }
  });

  return { state, handlers };
}
