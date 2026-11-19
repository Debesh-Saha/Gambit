'use client';

import { useMemo, useState } from "react";
import { Chess, Square } from "chess.js";

interface Props {
    fen: string;
    myColour: 'w' | 'b';
    canMove: boolean;
    onMove: (from: string, to: string) => void;
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

export function ChessBoard({ fen, myColour, canMove, onMove }: Props) {
    const chess = useMemo(() => new Chess(fen), [fen]);
    const [selected, setSelected] = useState<Square | null>(null);

    const targets = useMemo<Square[]>(() => {
        if (!selected) return [];
        return chess.moves({ square: selected, verbose: true }).map((m) => m.to);
    }, [chess, selected]);

    function handleClick(square: Square) {
        if (!canMove) return;
        if (selected && targets.includes(square)) {
            onMove(selected, square);
            setSelected(null);
            return;
        }
        const piece = chess.get(square);
        if (piece && piece.color === myColour && piece.color === chess.turn() && square !== selected) {
            setSelected(square);
        } else {
            setSelected(null);
        }
    }

    const cells = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const file = myColour === 'w' ? c : 7 - c;
            const rank = myColour === 'w' ? 8 - r : r + 1;
            const square = `${FILES[file]}${rank}` as Square;
            const piece = chess.get(square);
            const isLight = (file + rank) % 2 === 0;
            const isSelected = square === selected;
            const isTarget = targets.includes(square);

            cells.push(
                <div key={square} onClick={() => handleClick(square)} className={`relative flex aspect-square items-center justify-center ${isLight ? 'bg-amber-100' : 'bg-emerald-700'} ${isSelected ? 'ring-4 ring-inset ring-yellow-400' : ''} ${canMove ? 'cursor-pointer' : ''}`}>
                    {piece && (
                        <img
                            src={`/pieces/${piece.color}${piece.type}.png`}
                            alt={`${piece.color}${piece.type}`}
                            className="h-[85%] w-[85%] select-none"
                            draggable={false}
                        />
                    )}
                    {isTarget && (
                        <span className={`absolute rounded-full bg-black/30 ${piece ? 'h-full w-full bg-transparent ring-4 ring-inset ring-black/30' : 'h-1/4 w-1/4'}`} />
                    )}
                </div>
            )
        }
    }
    return <div className="grid w-full grid-cols-8 overflow-hidden rounded-lg shadow-xl">{cells}</div>;
}