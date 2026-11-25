'use client';

import { useState, useEffect } from "react";
import type { ClockState } from "@/hooks/useGame";

export function useRemaining(clock: ClockState, colour: 'w' | 'b') {
    const [now, setNow] = useState(() => Date.now());
    const running = clock.active === colour;

    useEffect(() => {
        if (!running) return;
        const id = setInterval(() => setNow(Date.now()), 100);
        return () => clearInterval(id);
    }, [running, clock.syncedAt]);

    const base = colour === 'w' ? clock.white : clock.black;
    const elapsed = running ? Math.max(0, now - clock.syncedAt) : 0;
    return Math.max(0, base - elapsed);
}

function formatClock(ms: number) {
    if (ms < 10_000) return (ms / 1000).toFixed(1);
    const secs = Math.ceil(ms / 1000);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

export function Clock({ ms }: { ms: number }) {
  return (
    <span className={`font-mono text-lg tabular-nums ${ms < 30_000 ? 'text-red-300' : ''}`}>
      {formatClock(ms)}
    </span>
  );
}