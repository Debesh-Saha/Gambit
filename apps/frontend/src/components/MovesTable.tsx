import { discoverValidationDepths } from "next/dist/server/app-render/instant-validation/instant-validation";
import { Fragment } from "react";

export function MovesTables({ moves }: { moves: string[] }) {
    const rows = [];
    for (let i = 0; i < moves.length; i += 2) {
        rows.push({ n: i / 2 + 1, white: moves[i], black: moves[i + 1] });
    }

    return (
        <div className="h-72 overflow-y-auto rounded-lg bg-neutral-800 p-3 text-sm">
            <h2 className="mb-2 font-semibold text-neutral-300">Moves</h2>
            {rows.length === 0 && <p className="text-neutral-500">No moves yet</p>}
            <div className="grid grid-cols-[2rem_1fr_1fr] gap-y-1">
                {rows.map((r) => (
                    <Fragment key={r.n}>
                        <span className="text-neutral-500">{r.n}.</span>
                        <span>{r.white}</span>
                        <span>{r.black ?? ''}</span>
                    </Fragment>
                ))}
            </div>
        </div>
    );
}