import { Suspense } from 'react';
import Game from '@/screens/Game';

export default function GamePage() {
  return (
    <Suspense fallback={<p className="p-8 text-center text-neutral-400">Loading…</p>}>
      <Game />
    </Suspense>
  );
}