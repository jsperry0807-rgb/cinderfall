import { PCT, SOULS, sCost } from "@cinderfall/sim";
import { useGameStore } from "../../game/store";

export function SoulsTab() {
    const souls = useGameStore((s) => s.snap?.souls);
    const shards = useGameStore((s) => s.snap?.shards ?? 0);
    const dispatch = useGameStore((s) => s.dispatch);

    const total = Object.values(souls ?? {}).reduce((a, b) => a + b, 0);

    return (
        <div className="soul-list">
            <div className="list-head">
                <span>
                    Soul shards: <b className="shards-text">✹ {shards}</b>
                </span>
                <span className="mu">· {total} ranks</span>
            </div>
            <p className="mu note">
                Permanent. Earned on death and milestones, never lost.
            </p>

            {SOULS.map((soul) => {
                const rank = souls?.[soul.id] ?? 0;
                const cost = sCost(soul, rank);
                const can = shards >= cost;
                const totalValue = rank ? soul.val * rank : 0;

                return (
                    <div
                        className={`soul-card${rank ? " has" : ""}`}
                        key={soul.id}
                    >
                        <div className="card-head">
                            <b>{soul.n}</b>
                            <span className="mu">
                                Rank {rank}
                                {rank
                                    ? ` · +${
                                          totalValue % 1
                                              ? totalValue.toFixed(1)
                                              : totalValue
                                      }${PCT.has(soul.stat) ? "%" : ""}`
                                    : ""}
                            </span>
                        </div>
                        <em>{soul.d}</em>
                        <div className="card-row">
                            <span>
                                Next: {cost} shard{cost === 1 ? "" : "s"}
                            </span>
                            <button
                                className="sm"
                                disabled={!can}
                                onClick={() =>
                                    dispatch({ type: "buySoul", id: soul.id })
                                }
                            >
                                Buy
                            </button>
                            <button
                                className="sm"
                                disabled={!can}
                                onClick={() =>
                                    dispatch({
                                        type: "buySoul",
                                        id: soul.id,
                                        max: true,
                                    })
                                }
                            >
                                Max
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
