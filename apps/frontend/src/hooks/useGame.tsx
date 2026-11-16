'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Chess } from "chess.js";
import { useSocket } from "./useSocket";
import { useUser } from "./useUser";
import { EXIT_GAME, GAME_ADDED, GAME_ALERT, GAME_ENDED, GAME_JOINED, GAME_NOT_FOUND, INIT_GAME, JOIN_ROOM, MOVE } from "@/lib/messages";

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

interface GameContextValue {
    game: GameInfo | null;
    fen: string;
    moves: string[];
    result: GameResult | null;
    waiting: boolean;
    notFound: boolean;
    message: string | null;
    myColour: 'w' | 'b'
    findGame: () => void;
    joinGame: (gameId: string) => void;
    sendMove: (from: string, to: string) => void;
    resign: () => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
    const socket = useSocket();
    const { user } = useUser();
    const router = useRouter();
    const chessRef = useRef(new Chess());
    const pendingJoin = useRef('');

    const [game, setGame] = useState<GameInfo | null>(null);
    const [fen, setFen] = useState(chessRef.current.fen());
    const [moves, setMoves] = useState<string[]>([]);
    const [result, setResult] = useState<GameResult | null>(null);
    const [waiting, setWaiting] = useState(false);
    const [notFound, setNotFound] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

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
                    setWaiting(true);
                    break;

                case INIT_GAME:
                    setWaiting(false);
                    setResult(null);
                    setNotFound(false);
                    setMessage(null);
                    setGame({ gameId: p.gameId, white: p.whitePlayer, black: p.blackPlayer });
                    loadMoves(p.moves ?? []);
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
                    } catch {
                        console.error('Server sent a move we cannot play', p.move);
                    }
                    break;

                case GAME_JOINED:
                    setResult(null);
                    setNotFound(false);
                    setGame({ gameId: p.gameId, white: p.whitePlayer, black: p.blackPlayer });
                    loadMoves(p.moves ?? []);
                    break;

                case GAME_ENDED:
                    setResult({ result: p.result, status: p.status });
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
                    setMessage(p?.message ?? 'Something happened');
                    break;
            }
        };

        socket.addEventListener('message', onMessage);
        return () => socket.removeEventListener('message', onMessage);
    }, [socket, router, loadMoves]);

    const send = useCallback(
        (obj: unknown) => {
            if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(obj));
        },
        [socket],
    );

    const findGame = useCallback(() => {
        setResult(null);
        setMessage(null);
        send({ type: INIT_GAME });
    }, [send]);

    const joinGame = useCallback(
        (gameId: string) => {
            pendingJoin.current = gameId;
            setNotFound(false);
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
            value={{ game, fen, moves, result, waiting, notFound, message, myColour, findGame, joinGame, sendMove, resign }}
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