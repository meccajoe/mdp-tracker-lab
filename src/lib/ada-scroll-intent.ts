export type AdaFollowState = { following: boolean; unseen: boolean };
export type AdaFollowEvent =
  | { type: "submit" | "jump_latest" | "reach_live_edge" }
  | { type: "scroll_away" | "selection" | "keyboard" | "link" | "search" }
  | { type: "stream_delta" };

export const initialAdaFollowState: AdaFollowState = { following: true, unseen: false };

export function reduceAdaFollowState(state: AdaFollowState, event: AdaFollowEvent): AdaFollowState {
  if (event.type === "submit" || event.type === "jump_latest" || event.type === "reach_live_edge") return { following: true, unseen: false };
  if (["scroll_away", "selection", "keyboard", "link", "search"].includes(event.type)) return { following: false, unseen: state.unseen };
  if (event.type === "stream_delta" && !state.following) return { following: false, unseen: true };
  return state;
}
