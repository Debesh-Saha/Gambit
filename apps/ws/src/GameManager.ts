import { WebSocket } from "ws";
import { GAME_OVER, INIT_GAME, JOIN_GAME, MOVE, OPPONENT_DISCONNECTED, JOIN_ROOM, GAME_JOINED, GAME_NOT_FOUND, GAME_ALERT, GAME_ADDED, GAME_ENDED, EXIT_GAME, CANCEL_SEARCH, MATCH_FOUND, SEARCH_CANCELLED } from "./messages";
import { Square } from "chess.js";
import { socketManager, User } from "./SocketManager";
import { Game, isPromoting, GAME_TIME_MS } from "./Game";
import { db } from "./db";
import { GameStatus } from "@repo/db";

export class GameManager {
    private games: Game[];
    private pendingGameId: string | null;
    private users: User[];
    private pendingUser: User | null;

    constructor() {
        this.games = [];
        this.pendingGameId = null;
        this.users = [];
        this.pendingUser = null;
    }

    addUser(user: User) {
        this.users.push(user);
        this.addHandler(user);
    }

        removeUser(socket: WebSocket) {
        const user = this.users.find((user) => user.socket === socket);
        if (!user) {
            console.error("User not found?");
            return;
        }
        this.users = this.users.filter((user) => user.socket !== socket);
        this.cancelPendingGame(user, false);

        // was this connection part of a live game?
        const game = this.games.find(
            (g) =>
                !g.result &&
                g.player2UserId &&
                (g.player1UserId === user.userId || g.player2UserId === user.userId),
        );

        socketManager.removeUser(user);

        // start the "come back" countdown, unless another tab of the same account is still in the game
        if (game && !socketManager.hasUser(game.gameId, user.userId)) {
            game.playerDisconnected(user.userId);
        }
    }

    private cancelPendingGame(user: User, leaveRoom: boolean): boolean {
        // only the player who is actually waiting (this very socket) can cancel
        if (!this.pendingGameId || this.pendingUser?.socket !== user.socket) return false;

        this.removeGame(this.pendingGameId);
        this.pendingGameId = null;
        this.pendingUser = null;
        if (leaveRoom) socketManager.removeUser(user);
        return true;
    }

    removeGame(gameId: string) {
        this.games = this.games.filter((g) => g.gameId !== gameId);
    }

    private addHandler(user: User) {
        user.socket.on("message", async (data) => {
            let message;

            try {
                message = JSON.parse(data.toString());
            } catch {
                return;
            }

            if (!message || typeof message.type !== "string") return;

            try {
                if (message.type === INIT_GAME) {
                    let pendingGame = this.pendingGameId
                        ? this.games.find((x) => x.gameId === this.pendingGameId)
                        : undefined;

                    if (!pendingGame || pendingGame.player2UserId) {
                        pendingGame = undefined;
                        this.pendingGameId = null;
                        this.pendingUser = null;
                    }

                    if (pendingGame) {
                        if (user.userId === pendingGame.player1UserId) {
                            user.socket.send(
                                JSON.stringify({
                                    type: GAME_ALERT,
                                    payload: {
                                        message: "You are already searching for a game in another tab.",
                                    },
                                }),
                            );
                            return;
                        }
                        socketManager.addUser(user, pendingGame.gameId);
                        // clear BEFORE the await, so nobody else can grab the same game
                        this.pendingGameId = null;
                        this.pendingUser = null;
                        // tell both players right away, before the slow database step
                        socketManager.broadcast(
                            pendingGame.gameId,
                            JSON.stringify({ type: MATCH_FOUND }),
                        );
                        await pendingGame.updateSecondPlayer(user.userId);
                    } else {
                        const game = new Game(user.userId, null);
                        this.games.push(game);
                        this.pendingGameId = game.gameId;
                        this.pendingUser = user;
                        socketManager.addUser(user, game.gameId);
                        socketManager.broadcast(
                            game.gameId,
                            JSON.stringify({
                                type: GAME_ADDED,
                                gameId: game.gameId,
                            }),
                        );
                    }
                }

                if (message.type === CANCEL_SEARCH) {
                    const cancelled = this.cancelPendingGame(user, true);
                    // if it was too late to cancel, say nothing: the game start message follows
                    if (cancelled) {
                        user.socket.send(JSON.stringify({ type: SEARCH_CANCELLED }));
                    }
                }

                if (message.type === MOVE) {
                    const game = this.games.find((g) => g.gameId === message.payload?.gameId);
                    if (game) {
                        await game.makeMove(user, message.payload.move);
                        if (game.result) this.removeGame(game.gameId);
                    }
                }

                if (message.type === EXIT_GAME) {
                    const game = this.games.find((g) => g.gameId === message.payload?.gameId);
                    if (game) {
                        await game.exitGame(user);
                        if (game.result) this.removeGame(game.gameId);
                    }
                }

                if (message.type === JOIN_ROOM) {
                    const gameId = message.payload?.gameId;
                    if (!gameId) return;

                    let availableGame = this.games.find((game) => game.gameId === gameId);

                    const gameFromDb = await db.game.findUnique({
                        where: { id: gameId },
                        include: {
                            moves: {
                                orderBy: {
                                    moveNumber: "asc",
                                },
                            },
                            blackPlayer: true,
                            whitePlayer: true,
                        },
                    });

                    if (availableGame && !availableGame.player2UserId) {
                        socketManager.addUser(user, availableGame.gameId);
                        await availableGame.updateSecondPlayer(user.userId);
                        return;
                    }

                    if (!gameFromDb) {
                        user.socket.send(
                            JSON.stringify({
                                type: GAME_NOT_FOUND,
                            }),
                        );
                        return;
                    }

                    if (gameFromDb.status !== GameStatus.IN_PROGRESS) {
                        user.socket.send(
                            JSON.stringify({
                                type: GAME_ENDED,
                                payload: {
                                    result: gameFromDb.result,
                                    status: gameFromDb.status,
                                    moves: gameFromDb.moves,
                                    blackPlayer: {
                                        id: gameFromDb.blackPlayer.id,
                                        name: gameFromDb.blackPlayer.name,
                                    },
                                    whitePlayer: {
                                        id: gameFromDb.whitePlayer.id,
                                        name: gameFromDb.whitePlayer.name,
                                    },
                                },
                            }),
                        );
                        return;
                    }

                    if (!availableGame) {
                        const game = new Game(
                            gameFromDb?.whitePlayerId!,
                            gameFromDb?.blackPlayerId!,
                            gameFromDb.id,
                            gameFromDb.startAt,
                        );

                        game.seedMoves(gameFromDb?.moves || []);
                        this.games.push(game);
                        availableGame = game;
                    }

                    console.log(availableGame.getPlayer1TimeConsumed());
                    console.log(availableGame.getPlayer2TimeConsumed());

                    user.socket.send(
                        JSON.stringify({
                            type: GAME_JOINED,
                            payload: {
                                gameId,
                                moves: gameFromDb.moves,
                                blackPlayer: {
                                    id: gameFromDb.blackPlayer.id,
                                    name: gameFromDb.blackPlayer.name,
                                },
                                whitePlayer: {
                                    id: gameFromDb.whitePlayer.id,
                                    name: gameFromDb.whitePlayer.name,
                                },
                                player1TimeConsumed: availableGame.getPlayer1TimeConsumed(),
                                player2TimeConsumed: availableGame.getPlayer2TimeConsumed(),
                                timeMs: GAME_TIME_MS,
                            },
                        }),
                    );

                    socketManager.addUser(user, gameId);
                }
            } catch (err) {
                console.error("Error handling message", message.type, err);
            }
        });
    }
}