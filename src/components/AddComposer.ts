export interface AddComposerState {
  isOpen: boolean;
  value: string;
  isSubmitting: boolean;
  error: string | null;
  message: string | null;
}

export type AddComposerAction =
  | { type: "open" }
  | { type: "cancel" }
  | { type: "append"; input: string }
  | { type: "backspace" }
  | { type: "setSubmitting"; value: boolean }
  | { type: "setError"; error: string }
  | { type: "setMessage"; message: string };

export const INITIAL_ADD_COMPOSER_STATE: AddComposerState = {
  isOpen: false,
  value: "",
  isSubmitting: false,
  error: null,
  message: null,
};

export function addComposerReducer(
  state: AddComposerState,
  action: AddComposerAction,
): AddComposerState {
  switch (action.type) {
    case "open":
      return {
        ...state,
        isOpen: true,
        value: "",
        error: null,
        message: null,
      };
    case "cancel":
      return {
        ...state,
        isOpen: false,
        value: "",
        error: null,
      };
    case "append":
      return { ...state, value: state.value + action.input };
    case "backspace":
      return { ...state, value: state.value.slice(0, -1) };
    case "setSubmitting":
      return { ...state, isSubmitting: action.value };
    case "setError":
      return { ...state, error: action.error, message: null };
    case "setMessage":
      return { ...state, message: action.message, error: null };
  }
}
