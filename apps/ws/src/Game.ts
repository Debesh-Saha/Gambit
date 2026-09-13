import { Chess, Move, Square } from "chess.js";
import { GAME_ENDED, INIT_GAME, MOVE } from "./messages";
import { randomUUID } from "crypto";
import { socketManager, User } from "./SocketManager";

type GAME_STATUS = 'IN_PROGRESS' | 'COMPLETED' | 'ABONDONED' | 'TIME_UP' | 'PLAYER_EXIT';
type GAME_RESULT = 'WHITE_WINS' | 'BLACK_WINS' | 'DRAW';
const GAME_TIME_MS = 10 * 60 * 60 * 1000;


export function isPromoting(chess: Chess, from: Square, to: Square) {
    if (!from) return false;

    const piece = chess.get(from);

    if (piece?.type !== 'p') return false;
    if (piece.color !== chess.turn()) return false;
    if (!['1', '8'].some((it) => to.endsWith(it))) return false;

    return chess
        .moves({ square: from, verbose: true })
        .map((it) => it.to)
        .includes(to);
}

export class Game {
    public gameId: string;
    public player1UserId: string;
    public player2UserId: string | null;
    public board: Chess;
    private moveCount = 0;
    private timer: NodeJS.Timeout | null = null;
    private moveTimer: NodeJS.Timeout | null = null;
    public result: GAME_RESULT | null = null;
    private player1TimeConsumed = 0;
    private player2TimeConsumed = 0;
    private startTime = new Date(Date.now());
    private lastMoveTime = new Date(Date.now());

    constructor(player1UserId: string, player2UserId: string | null, gameId?: string, startTime?: Date) {
        this.player1UserId = player1UserId;
        this.player2UserId = player2UserId;
        this.board = new Chess();
        this.gameId = gameId ?? randomUUID();
        if (startTime) {
            this.startTime = startTime;
            this.lastMoveTime = startTime;
        }
    }

    seedMoves(moves: {
        id: string;
        gameId: string;
        movesNumber: number;
        from: string;
        to: string;
        comments: string | null;
        timeTaken: number | null;
        createdAt: Date;
    }[]) {
        console.log(moves);
        moves.forEach((move) => {
            if (isPromoting(this.board, move.from as Square, move.to as Square)) {
                this.board.move({
                    from: move.from,
                    to: move.to,
                    promotion: 'q',
                });
            } else {
                this.board.move({
                    from: move.from,
                    to: move.to,
                })
            }
        });
        this.moveCount = moves.length;
        const lastMove = moves[moves.length - 1];
        if (lastMove !== undefined) {
            this.lastMoveTime = lastMove.createdAt;
        }

        moves.map((move, index)=>{
            if(move.timeTaken){
                if(index%2==0){
                    this.player1TimeConsumed+=move.timeTaken;
                }else{
                    this.player2TimeConsumed+=move.timeTaken;
                }
            }
        });
        this.resetAbondonTimer();
        this.resetMoveTimer();
    }
}