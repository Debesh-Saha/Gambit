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
    
    async updateSecondPlayer(player2UserId: string){
        this.player2UserId= player2UserId;
        const users= await db.user.findMany({
            where:{id: {[this.player1UserId, this.player2UserId ?? '']}}
        })
        
        try{
            await this.createGameInDb();
        }catch(e){
            console.error(e);
            return;
        }

        const WhitePlayer= users.find((user)=>user.id=== this.player1UserId);
        const BlackPlayer= users.find((user)=>user.id=== this.player2UserId);

        socketManager.broadcast(
            this.gameId,
            JSON.stringify({
                type: INIT_GAME,
                payload: {
                    gameId: this.gameId,
                    whitePlayer: {
                        name: WhitePlayer?.name,
                        id: this.player1UserId,
                        isGuest: WhitePlayer?.provider===AuthProvider.GUEST;
                    },
                    blackPlayer: {
                        name: BlackPlayer?.name,
                        id: this.player2UserId,
                        isGuest: BlackPlayer?.provider===AuthProvider.GUEST;
                    },
                    fen: this.board.fen(),
                    moves: [],
                },
            }),
        );
    }

    async createGameInDb(){
        this.startTime= new Date(Date.now());
        this.lastMoveTime= this.startTime;

        const game= await db.game.create({
            data:{
                id: this.gameId,
                timeControl: 'CLASSICAL',
                status: 'IN_PROGRESS',
                start: this.startTime,
                currentFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
                whitePlayer: {
                    connect: {
                        id: this.player1UserId,
                    }
                },
                blackPlayer: {
                    connect: {
                        id: this.player2UserId ?? '',
                    }
                }
            },
            include: {
                whitePlayer: true,
                blackPlayer: true,
            },
        });
        this.gameId= game.id;
    }

    async addMoveToDb(move: Move, moveTimeStamp: Date){
        await db.$transaction([
            db.move.create({
                data: {
                    gameId: this.gameId,
                    moveNumber: this.moveCount+1,
                    from: move.from,
                    to: move.to,
                    before: move.before,
                    after: move.after,
                    createdAt: moveTimeStamp,
                    timeTaken: moveTimeStamp.getTime()-this.lastMoveTime.getTime(),
                    san: move.san
                },
            }),
            db.game.update({
                data: {
                    currentFen: move.after,
                },
                where: {
                    id: this.gameId,
                },
            }),
        ]);
    }

    async makeMove(user: User, move: Move){
        if(this.board.turn()==='w' && user.userId!==this.player1UserId) return;
        
        if(this.board.turn()==='b' && user.userId!==this.player2UserId) return;
        
        if(this.result){
            console.error(`User ${user.userId} is making a move post game completion`);
            return;
        }
        
        const moveTimeStamp= new Date(Date.now());

        try{
            if(isPromoting(this.board, move.from, move.to)){
                this.board.move({
                    from: move.from,
                    to: move.to,
                    promotion: 'q',
                })
            }else{
                this.board.move({
                    from: move.from,
                    to: move.to
                })
            }
        }catch(e){
            console.error("Error while making move");
            return;
        }
        
        if(this.board.turn()==='b'){
            this.player1TimeConsumed=this.player1TimeConsumed+(moveTimeStamp.getTime()-this.lastMoveTime.getTime());
        }
        
        if(this.board.turn()==='w'){
            this.player2TimeConsumed=this.player2TimeConsumed+(moveTimeStamp.getTime()-this.lastMoveTime.getTime());
        }

        await this.addMoveToDb(move, moveTimeStamp);
        socketManager.broadcast(
            this.gameId,
            JSON.stringify({
                type: MOVE,
                payload: {
                    move,
                    player1TimeConsumed: this.player1TimeConsumed,
                    player2TimeConsumed: this.player2TimeConsumed,
                }
            })
        );

        if(this.board.isGameOver()){
            const result= this.board.isDraw()? 'DRAW' : this.board.turn()==='b'? 'WHITE_WINS' : 'BLACK_WINS';
            this.endGame('COMPLETED', result);
        }
        this.moveCount++;
    }
}