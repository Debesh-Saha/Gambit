import { Button } from "./Button";
import { GameResult } from "@/hooks/useGame";

interface Props {
    result: GameResult;
    myColour: 'w' | 'b';
    isPlayer: boolean;
    onNewGame: () => void;
}

export function GameEndModal({ result, myColour, isPlayer, onNewGame }: Props) {
    let title = 'Draw';
    if (result.result === 'WHITE_WINS' || result.result === 'BLACK_WINS') {
        const whiteWon = result.result === 'WHITE_WINS';
        if (!isPlayer) title = whiteWon ? 'White wins' : 'Black wins';
        else title = whiteWon === (myColour === 'w') ? 'You won!' : 'You lost';
    }
    const reason = result.status.replace(/_/g, ' ').toLowerCase();

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="flex w-80 flex-col items-center gap-4 rounded-xl bg-neutral-800 p-8 text-center shadow-2xl">
                <h2 className="text-3xl font-bold">{title}</h2>
                <p className="text-neutral-400">by {reason}</p>
                <Button onClick={onNewGame}>New game</Button>
            </div>
        </div>
    );
}