"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import { AdaConversationRail } from "@/components/ada-conversation-rail";
import { initialAdaFollowState, reduceAdaFollowState } from "@/lib/ada-scroll-intent";

export type AdaScrollerItem = { id: string; role: "user" | "assistant" | "system"; content: string; node: ReactNode };

export function AdaConversationScroller({ workspaceId, items, anchorTurnId, streaming, streamSignal, streamStatus }: {
  workspaceId: string;
  items: AdaScrollerItem[];
  anchorTurnId?: string | null;
  streaming: boolean;
  streamSignal: string;
  streamStatus?: string | null;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const programmaticRef = useRef(false);
  const restoredRef = useRef(false);
  const anchorTopRef = useRef<number | null>(null);
  const [followState, dispatch] = useReducer(reduceAdaFollowState, initialAdaFollowState);
  const [activeId, setActiveId] = useState<string | null>(null);
  const userTurns = useMemo(() => items.filter((item) => item.role === "user").map(({ id, content }) => ({ id, content })), [items]);
  const positionKey = `ada:position:${workspaceId}`;

  const elementFor = useCallback((id: string) => contentRef.current?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(id)}"]`) ?? null, []);
  const isAtLiveEdge = useCallback(() => {
    const viewport = viewportRef.current;
    return Boolean(viewport && viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 32);
  }, []);
  const nearestTurn = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport || userTurns.length === 0) return null;
    const top = viewport.getBoundingClientRect().top + 112;
    return userTurns.reduce((nearest, turn) => {
      const element = elementFor(turn.id);
      if (!element) return nearest;
      const distance = Math.abs(element.getBoundingClientRect().top - top);
      return !nearest || distance < nearest.distance ? { id: turn.id, distance } : nearest;
    }, null as { id: string; distance: number } | null)?.id ?? null;
  }, [elementFor, userTurns]);

  const savePosition = useCallback((id: string | null) => {
    const viewport = viewportRef.current;
    const element = id ? elementFor(id) : null;
    if (!viewport || !element) return;
    localStorage.setItem(positionKey, JSON.stringify({ id, offset: element.getBoundingClientRect().top - viewport.getBoundingClientRect().top }));
  }, [elementFor, positionKey]);

  const scrollToTurn = useCallback((id: string, behavior: ScrollBehavior = "smooth", resume = false) => {
    const viewport = viewportRef.current;
    const element = elementFor(id);
    if (!viewport || !element) return;
    if (!resume) dispatch({ type: "scroll_away" });
    programmaticRef.current = true;
    anchorTopRef.current = null;
    viewport.scrollTo({ top: Math.max(0, element.offsetTop - 96), behavior });
    setActiveId(id);
    window.setTimeout(() => { programmaticRef.current = false; savePosition(id); }, behavior === "smooth" ? 350 : 0);
  }, [elementFor, savePosition]);

  const jumpToLatest = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    dispatch({ type: "jump_latest" });
    programmaticRef.current = true;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
    window.setTimeout(() => { programmaticRef.current = false; }, 350);
  }, []);

  useEffect(() => { restoredRef.current = false; }, [workspaceId]);
  useEffect(() => {
    if (restoredRef.current || userTurns.length === 0) return;
    restoredRef.current = true;
    let saved: { id?: string; offset?: number } | null = null;
    try { saved = JSON.parse(localStorage.getItem(positionKey) ?? "null"); } catch { saved = null; }
    const id = saved?.id && userTurns.some((turn) => turn.id === saved?.id) ? saved.id : userTurns.at(-1)?.id;
    if (!id) return;
    requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      const element = elementFor(id);
      if (!viewport || !element) return;
      viewport.scrollTop = Math.max(0, element.offsetTop - (typeof saved?.offset === "number" ? saved.offset : 96));
      setActiveId(id);
    });
  }, [elementFor, positionKey, userTurns]);

  useEffect(() => {
    if (!anchorTurnId) return;
    dispatch({ type: "submit" });
    requestAnimationFrame(() => scrollToTurn(anchorTurnId, "smooth", true));
  }, [anchorTurnId, scrollToTurn]);

  useEffect(() => {
    if (!streamSignal) return;
    dispatch({ type: "stream_delta" });
    if (!followState.following) return;
    requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      programmaticRef.current = true;
      viewport.scrollTop = viewport.scrollHeight;
      programmaticRef.current = false;
    });
  }, [followState.following, streamSignal]);

  useEffect(() => {
    const onSelection = () => {
      const selection = document.getSelection();
      if (selection && !selection.isCollapsed && viewportRef.current?.contains(selection.anchorNode)) dispatch({ type: "selection" });
    };
    document.addEventListener("selectionchange", onSelection);
    return () => document.removeEventListener("selectionchange", onSelection);
  }, []);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const observer = new ResizeObserver(() => {
      const viewport = viewportRef.current;
      const anchor = activeId ? elementFor(activeId) : null;
      if (!viewport || !anchor) return;
      const currentTop = anchor.getBoundingClientRect().top;
      if (!programmaticRef.current && !followState.following && anchorTopRef.current !== null) viewport.scrollTop += currentTop - anchorTopRef.current;
      anchorTopRef.current = anchor.getBoundingClientRect().top;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [activeId, elementFor, followState.following]);

  const handleScroll = () => {
    const nearest = nearestTurn();
    setActiveId(nearest);
    if (!programmaticRef.current) {
      if (isAtLiveEdge()) dispatch({ type: "reach_live_edge" }); else dispatch({ type: "scroll_away" });
      savePosition(nearest);
    }
    const anchor = nearest ? elementFor(nearest) : null;
    anchorTopRef.current = anchor?.getBoundingClientRect().top ?? null;
  };
  const pauseForKeyboard = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") dispatch({ type: "search" });
    else if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) dispatch({ type: "keyboard" });
  };

  return <div className="relative min-h-0 flex-1 overflow-hidden">
    <div ref={viewportRef} onScroll={handleScroll} onWheel={() => requestAnimationFrame(() => { if (!isAtLiveEdge()) dispatch({ type: "scroll_away" }); })} onTouchStart={() => dispatch({ type: "scroll_away" })} onKeyDown={pauseForKeyboard} onClickCapture={(event) => { if ((event.target as HTMLElement).closest("a")) dispatch({ type: "link" }); }} className="size-full overflow-y-auto overscroll-contain px-4 py-6 [overflow-anchor:auto] sm:px-6 md:pr-10" tabIndex={0} aria-label="Conversation transcript">
      <div ref={contentRef} className="mx-auto max-w-3xl space-y-4 pb-24">{items.map((item) => <div key={item.id} data-message-id={item.id} className="[contain-intrinsic-size:auto_8rem] [content-visibility:auto]">{item.node}</div>)}</div>
    </div>
    <AdaConversationRail turns={userTurns} activeId={activeId} streamingTurnId={streaming ? anchorTurnId : null} unseen={followState.unseen} onJump={(id) => scrollToTurn(id)} />
    {!followState.following && (followState.unseen || streaming) ? <button type="button" onClick={jumpToLatest} className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium shadow-md">Jump to latest{streaming ? " · Ada is responding" : ""}</button> : null}
    <div aria-live="polite" aria-atomic="true" className="sr-only">{streamStatus ?? (streaming ? "Ada is responding" : "")}</div>
  </div>;
}
