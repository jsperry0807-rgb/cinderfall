import { useEffect, useState } from "react";
import { useGameStore } from "../../game/store";

/** Seconds the death screen stays up before the idle loop resumes. */
export const AUTO_REBIRTH_SECONDS = 4;

export function DeathModal() {
    const dead = useGameStore((s) => s.snap?.dead ?? false);
    const stage = useGameStore((s) => s.snap?.stage ?? 1);
    const lvl = useGameStore((s) => s.snap?.lvl ?? 1);
    const pend = useGameStore((s) => s.snap?.pend ?? 0);
    const shards = useGameStore((s) => s.snap?.shards ?? 0);
    const dispatch = useGameStore((s) => s.dispatch);
    const [remaining, setRemaining] = useState(AUTO_REBIRTH_SECONDS);

    // The game is idle: don't require a click to keep the loop running. The
    // button still lets the player rise immediately.
    useEffect(() => {
        if (!dead) return;

        setRemaining(AUTO_REBIRTH_SECONDS);
        const startedAt = Date.now();
        const interval = window.setInterval(() => {
            const elapsed = Math.floor((Date.now() - startedAt) / 1000);
            setRemaining(Math.max(0, AUTO_REBIRTH_SECONDS - elapsed));
        }, 250);
        const timer = window.setTimeout(() => {
            dispatch({ type: "rebirth" });
        }, AUTO_REBIRTH_SECONDS * 1000);

        return () => {
            window.clearInterval(interval);
            window.clearTimeout(timer);
        };
    }, [dead, dispatch]);

    if (!dead) return null;

    return (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="death-title">
            <div className="modal death">
                <h2 id="death-title">You Died</h2>
                <p>
                    You fell at <b>stage {stage}</b>, level <b>{lvl}</b>.
                </p>
                <p className="mu">
                    Gold, gear, forge upgrades and skill points are lost — but you
                    rise again with{" "}
                    <b className="shards-text">
                        ✹ {pend} shard{pend === 1 ? "" : "s"}
                    </b>
                    .
                </p>
                <p className="mu">Total after rebirth: {shards + pend}</p>
                <button
                    className="btn"
                    onClick={() => dispatch({ type: "rebirth" })}
                >
                    Rise from the ashes
                </button>
                <p className="mu auto-rebirth">
                    Rising automatically in {remaining}s…
                </p>
            </div>
        </div>
    );
}
