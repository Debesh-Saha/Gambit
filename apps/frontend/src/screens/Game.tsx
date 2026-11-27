'use client';

import { ReactNode, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/Button';
import { ChessBoard } from '@/components/ChessBoard';
import { MovesTable } from '@/components/MovesTable';
import { GameEndModal } from '@/components/GameEndModal';
import { useUser } from '@/hooks/useUser';
import { useSocket } from '@/hooks/useSocket';
import { useGame } from '@/hooks/useGame';
import { Clock, useRemaining } from '@/components/Clock';

function Centered({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      {children}
    </main>
  );
}

function PlayerLabel({ name, active, ms }: { name: string; active: boolean; ms?: number }) {
  return (
    <div
      className={`flex items-center justify-between rounded-lg px-4 py-2 font-medium ${active ? 'bg-green-700' : 'bg-neutral-800 text-neutral-300'
        }`}
    >
      <span>{name}</span>
      {ms !== undefined && <Clock ms={ms} />}
    </div>
  );
}

export default function Game() {
  const { gameId } = useParams<{ gameId: string }>();
  const router = useRouter();
  const { user, loading } = useUser();
  const socket = useSocket();
  const { game, fen, moves, result, notFound, message, myColour, findGame, joinGame, sendMove, resign, clock, cancelSearch, searchStatus } = useGame();

  // Not logged in -> back to the landing page
  useEffect(() => {
    if (!loading && !user) router.replace('/');
  }, [loading, user, router]);

  // Opened a real game link (refresh / shared link) and we don't have it -> ask the server
  useEffect(() => {
    if (gameId !== 'random' && socket && game?.gameId !== gameId) joinGame(gameId);
  }, [gameId, socket, game?.gameId, joinGame]);

  const whiteMs = useRemaining(clock, 'w');
  const blackMs = useRemaining(clock, 'b');

  if (loading || !user) return <Centered>Loading…</Centered>;

  // The lobby: /game/random
  if (gameId === 'random') {
    return (
      <Centered>
        {message && <p className="text-yellow-400">{message}</p>}
        <div className="text-xl font-bold">Gambit</div>

        {!socket ? (
          <div className="animate-pulse text-neutral-300">Connecting…</div>
        ) : searchStatus === 'idle' ? (
          <Button onClick={findGame}>Play</Button>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="animate-pulse text-neutral-300">
              {searchStatus === 'searching' && 'Looking for a game…'}
              {searchStatus === 'waiting' && 'Waiting for an opponent…'}
              {searchStatus === 'matched' && 'Opponent found, starting the game…'}
              {searchStatus === 'cancelling' && 'Cancelling…'}
            </div>
            {searchStatus === 'waiting' ? (
              <Button variant="danger" onClick={cancelSearch}>
                Cancel
              </Button>
            ) : (
              <div className="h-12" /> // keeps the layout from jumping
            )}
          </div>
        )}
      </Centered>
    );
  }

  if (notFound) {
    return (
      <Centered>
        <h1 className="text-2xl font-bold">Game not found</h1>
        <Button onClick={() => router.push('/')}>Home</Button>
      </Centered>
    );
  }

  if (!game) return <Centered>Joining game…</Centered>;

  const isPlayer = game.white.id === user.id || game.black.id === user.id;
  const me = myColour === 'w' ? game.white : game.black;
  const opponent = myColour === 'w' ? game.black : game.white;
  const turn = fen.split(' ')[1]; // 'w' or 'b'
  const showClocks = clock.syncedAt > 0;
  const myMs = myColour === 'w' ? whiteMs : blackMs;
  const opponentMs = myColour === 'w' ? blackMs : whiteMs;

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center gap-6 p-4 lg:flex-row lg:items-start">
      <div className="w-full max-w-[560px]">
        <ChessBoard fen={fen} myColour={myColour} canMove={isPlayer && !result} onMove={sendMove} />
      </div>

      <aside className="flex w-full max-w-[560px] flex-col gap-4 lg:w-72">
        <PlayerLabel
          name={opponent.name}
          active={!result && turn !== myColour}
          ms={showClocks ? opponentMs : undefined} />
        <MovesTable moves={moves} />
        <PlayerLabel
          name={isPlayer ? `${me.name} (you)` : me.name}
          active={!result && turn === myColour}
          ms={showClocks ? myMs : undefined}
        />
        <Button variant="danger" onClick={resign} disabled={!isPlayer || !!result}>
          Resign
        </Button>
      </aside>

      {result && (
        <GameEndModal
          result={result}
          myColour={myColour}
          isPlayer={isPlayer}
          onNewGame={() => router.push('/game/random')}
        />
      )}
    </main>
  );
}