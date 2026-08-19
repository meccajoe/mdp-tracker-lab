"use client";

import { useState } from "react";

export type AdaConversationTurn = { id: string; content: string };

export function AdaConversationRail({ turns, activeId, streamingTurnId, unseen, onJump }: {
  turns: AdaConversationTurn[];
  activeId: string | null;
  streamingTurnId?: string | null;
  unseen: boolean;
  onJump: (id: string) => void;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const markers = turns.map((turn, index) => {
    const label = `Jump to turn ${index + 1}: ${turn.content.slice(0, 80)}`;
    return <button key={turn.id} type="button" aria-label={label} title={label} data-active={activeId === turn.id} data-streaming={streamingTurnId === turn.id} onClick={() => { onJump(turn.id); setMobileOpen(false); }} className="group flex h-5 w-6 items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className={`block h-0.5 rounded-full transition-all ${activeId === turn.id ? "w-5 bg-foreground" : streamingTurnId === turn.id ? "w-4 animate-pulse bg-foreground/70" : "w-3 bg-muted-foreground/35 group-hover:w-4 group-hover:bg-muted-foreground/70"}`} /></button>;
  });
  return <>
    <nav aria-label="Conversation turns" className="absolute right-1 top-1/2 z-10 hidden max-h-[65%] -translate-y-1/2 flex-col items-center overflow-y-auto rounded-full border border-border/70 bg-background/90 px-1 py-2 shadow-sm backdrop-blur md:flex">{markers}</nav>
    <div className="absolute right-3 top-3 z-20 md:hidden"><button type="button" aria-label="Open conversation navigator" onClick={() => setMobileOpen((value) => !value)} className="relative flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background shadow-sm"><span className="flex flex-col gap-0.5"><i className="block h-0.5 w-3 bg-muted-foreground" /><i className="block h-0.5 w-4 bg-muted-foreground" /><i className="block h-0.5 w-2 bg-muted-foreground" /></span>{unseen ? <span className="absolute right-0 top-0 h-2 w-2 rounded-full bg-foreground" /> : null}</button>{mobileOpen ? <nav aria-label="Conversation turns" className="mt-2 flex max-h-72 w-64 flex-col overflow-y-auto rounded-xl border border-border bg-background p-2 shadow-lg">{turns.map((turn, index) => <button key={turn.id} type="button" aria-label={`Jump to turn ${index + 1}`} data-active={activeId === turn.id} onClick={() => { onJump(turn.id); setMobileOpen(false); }} className={`rounded-lg px-3 py-2 text-left text-xs ${activeId === turn.id ? "bg-muted font-medium" : "hover:bg-muted/60"}`}><span className="block text-[10px] uppercase tracking-wide text-muted-foreground">Turn {index + 1}</span><span className="mt-0.5 line-clamp-2">{turn.content}</span></button>)}</nav> : null}</div>
  </>;
}
