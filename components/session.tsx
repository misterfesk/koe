"use client";
import {
  createContext,
  useContext,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";
import { initialState, reducer, type State, type Action } from "@/domain/state";
const Session = createContext<{
  state: State;
  dispatch: Dispatch<Action>;
} | null>(null);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () =>
    initialState(),
  );
  return (
    <Session.Provider value={{ state, dispatch }}>{children}</Session.Provider>
  );
}
export function useSession() {
  const value = useContext(Session);
  if (!value) throw new Error("SessionProvider missing");
  return value;
}
export function useDraft(key: string, initial = "") {
  const { state, dispatch } = useSession();
  return [
    state.drafts[key] ?? initial,
    (value: string) => dispatch({ type: "draft", key, value }),
  ] as const;
}
