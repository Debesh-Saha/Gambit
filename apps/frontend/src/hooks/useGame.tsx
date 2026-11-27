'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BLACK, Chess } from "chess.js";
import { useSocket } from "./useSocket";
import { useUser } from "./useUser";
import { EXIT_GAME, GAME_ADDED, GAME_ALERT, GAME_ENDED, GAME_JOINED, GAME_NOT_FOUND, INIT_GAME, JOIN_ROOM, MOVE, CANCEL_SEARCH, MATCH_FOUND, SEARCH_CANCELLED } from "@/lib/messages";

export interface Player {
    id: string;
    name: string;
    isGuest: boolean;
}
export interface GameInfo {
    gameId: string;
    white: Player;
    black: Player;
}
export interface GameResult {
    result: string;
    status: string;
}

export interface ClockState {
    white: number;  //Time left for the moment at syncedAt..
    black: number;
    active: 'w' | 'b' | null; //whose clock is running null means stopped..
    syncedAt: number;   //When we last synced with the server
}

export type SearchStatus = 'idle' | 'searching' | 'waiting' | 'matched' | 'cancelling';

interface GameContextValue {
    game: GameInfo | null;
    fen: string;
    moves: string[];
    result: GameResult | null;
    notFound: boolean;
    message: string | null;
    myColour: 'w' | 'b';
    clock: ClockState;
    findGame: () => void;
    joinGame: (gameId: string) => void;
    sendMove: (from: string, to: string) => void;
    resign: () => void;
    cancelSearch: () => void;
    searchStatus: SearchStatus
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
    const socket = useSocket();
    const { user } = useUser();
    const router = useRouter();
    const chessRef = useRef(new Chess());
    const pendingJoin = useRef('');
    const totalRef = useRef(10 * 60 * 1000);

    const [game, setGame] = useState<GameInfo | null>(null);
    const [fen, setFen] = useState(chessRef.current.fen());
    const [moves, setMoves] = useState<string[]>([]);
    const [result, setResult] = useState<GameResult | null>(null);
    const [notFound, setNotFound] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [clock, setClock] = useState<ClockState>({
        white: totalRef.current,
        black: totalRef.current,
        active: null,
        syncedAt: 0, //Initial 0 means no clock info for now..
    });

    const [searchState, setSearchState] = useState<{ socket: WebSocket; status: SearchStatus } | null>(null);
    // tied to the socket: if the connection changes, the search resets to "idle" by itself
    const searchStatus: SearchStatus = searchState && searchState.socket === socket ? searchState.status : 'idle';

    const syncClock = useCallback(
        (total: number, p1Consumed: number, p2Consumed: number, turn: 'w' | 'b') => {
            totalRef.current = total;
            setClock({
                white: total - p1Consumed,
                black: total - p2Consumed,
                active: turn,
                syncedAt: Date.now(),
            });
        },
        [],);
    //Replay the list of moves from the start.. when joining or loading a game..
    const loadMoves = useCallback((list: { from: string; to: string }[]) => {
        const chess = new Chess();
        const sans: string[] = [];
        for (const m of list) {
            try {
                sans.push(chess.move({ from: m.from, to: m.to, promotion: 'q' }).san);
            } catch {
                console.error('Bad move in history', m);
            }
        }
        chessRef.current = chess;
        setFen(chess.fen());
        setMoves(sans);
    }, []);

    // Listen to everything the server sends
    useEffect(() => {
        if (!socket) return;

        const onMessage = (event: MessageEvent) => {
            const message = JSON.parse(event.data);
            const p = message.payload;

            switch (message.type) {
                case GAME_ADDED:
                    setSearchState({ socket, status: 'waiting' });
                    break;

                case MATCH_FOUND:
                    setSearchState({ socket, status: 'matched' });
                    break;

                case SEARCH_CANCELLED:
                    setSearchState(null);
                    setMessage(null);
                    break;

                case INIT_GAME:
                    setSearchState(null);
                    setResult(null);
                    setNotFound(false);
                    setMessage(null);
                    setGame({ gameId: p.gameId, white: p.whitePlayer, black: p.blackPlayer });
                    loadMoves(p.moves ?? []);
                    syncClock(p.timeMs ?? totalRef.current, 0, 0, 'w');
                    router.push(`/game/${p.gameId}`);
                    break;

                case MOVE:
                    try {
                        const played = chessRef.current.move({
                            from: p.move.from,
                            to: p.move.to,
                            promotion: 'q',
                        });
                        setFen(chessRef.current.fen());
                        setMoves((prev) => [...prev, played.san]);
                        syncClock(
                            totalRef.current,
                            p.player1TimeConsumed,
                            p.player2TimeConsumed,
                            chessRef.current.turn(),
                        );
                    } catch {
                        console.error('Server sent a move we cannot play', p.move);
                    }
                    break;

                case GAME_JOINED:
                    setResult(null);
                    setNotFound(false);
                    setGame({ gameId: p.gameId, white: p.whitePlayer, black: p.blackPlayer });
                    loadMoves(p.moves ?? []);
                    syncClock(
                        p.timeMs ?? totalRef.current,
                        p.player1TimeConsumed,
                        p.player2TimeConsumed,
                        chessRef.current.turn(),
                    );
                    break;

                case GAME_ENDED:
                    setResult({ result: p.result, status: p.status });
                    setClock((prev) => {
                        if (!prev.active) return prev;
                        const spent = p.status === 'TIME_UP' ? Infinity : Date.now() - prev.syncedAt;
                        return prev.active === 'w'
                            ? { ...prev, white: Math.max(0, prev.white - spent), active: null }
                            : { ...prev, black: Math.max(0, prev.black - spent), active: null };
                    });
                    if (p.whitePlayer && p.blackPlayer) {
                        setGame((prev) => ({
                            gameId: prev?.gameId ?? pendingJoin.current,
                            white: p.whitePlayer,
                            black: p.blackPlayer,
                        }));
                        if (Array.isArray(p.moves)) loadMoves(p.moves);
                    }
                    break;

                case GAME_NOT_FOUND:
                    setNotFound(true);
                    break;

                case GAME_ALERT:
                    setSearchState((s) => (s?.status === 'searching' ? null : s));
                    setMessage(p?.message ?? 'Something happened');
                    break;
            }
        };

        socket.addEventListener('message', onMessage);
        return () => socket.removeEventListener('message', onMessage);
    }, [socket, router, loadMoves, syncClock]);

    const send = useCallback(
        (obj: unknown) => {
            if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(obj));
        },
        [socket],
    );

    const findGame = useCallback(() => {
        if (!socket) return;
        setResult(null);
        setMessage(null);
        setSearchState({ socket, status: 'searching' });
        // safety net: never stay stuck on "searching"
        setTimeout(() => setSearchState((s) => (s?.status === 'searching' ? null : s)), 8000);
        send({ type: INIT_GAME });
    }, [send, socket]);

    const cancelSearch = useCallback(() => {
        if (!socket || searchStatus !== 'waiting') return;
        setSearchState({ socket, status: 'cancelling' }); // wait for the server to confirm
        send({ type: CANCEL_SEARCH });
        setTimeout(() => setSearchState((s) => (s?.status === 'cancelling' ? null : s)), 5000);
    }, [send, socket, searchStatus]);

    const joinGame = useCallback(
        (gameId: string) => {
            pendingJoin.current = gameId;
            setNotFound(false);
            setClock((c) => ({ ...c, active: null, syncedAt: 0 }));
            send({ type: JOIN_ROOM, payload: { gameId } });
        },
        [send],
    );

    // We do NOT change the board here. We ask the server, and the board
    // changes when the server's "move" message comes back (server = boss).
    const sendMove = useCallback(
        (from: string, to: string) => {
            if (!game || result) return;
            const copy = new Chess(chessRef.current.fen());
            let move;
            try {
                move = copy.move({ from, to, promotion: 'q' });
            } catch {
                return; // illegal move
            }
            send({ type: MOVE, payload: { gameId: game.gameId, move } });
        },
        [game, result, send],
    );

    const resign = useCallback(() => {
        if (game) send({ type: EXIT_GAME, payload: { gameId: game.gameId } });
    }, [game, send]);

    const myColour: 'w' | 'b' = game && user && game.black.id === user.id ? 'b' : 'w';

    return (
        <GameContext.Provider
            value={{ game, fen, moves, result, notFound, message, myColour, clock, findGame, joinGame, sendMove, resign, cancelSearch, searchStatus }}
        >
            {children}
        </GameContext.Provider>
    );
}

export function useGame() {
    const ctx = useContext(GameContext);
    if (!ctx) throw new Error('useGame must be used inside <GameProvider>');
    return ctx;
}