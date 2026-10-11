"use client";

import { Eye, Wifi } from "lucide-react";

import { useGame } from "./GameProvider";

export function SessionBadge() {
  const { role, sessionCode, viewerCount } = useGame();
  if (!role || !sessionCode) return null;

  return (
    <div className="pointer-events-none absolute right-2 top-2 z-20 flex items-center gap-2 rounded-full border border-white/20 bg-black/60 px-3 py-1.5 text-xs uppercase tracking-widest text-jeopardy-cream backdrop-blur">
      {role === "host" ? (
        <>
          <Wifi className="size-3.5 text-emerald-400" />
          <span>
            Code <span className="font-display text-jeopardy-gold-bright">{sessionCode}</span>
          </span>
          <span className="text-white/50">
            {viewerCount} watching
          </span>
        </>
      ) : (
        <>
          <Eye className="size-3.5 text-emerald-400" />
          <span>Watching · {sessionCode}</span>
        </>
      )}
    </div>
  );
}
