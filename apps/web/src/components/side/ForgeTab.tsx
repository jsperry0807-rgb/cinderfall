import { PCT, UPGRADES, fn, upCost } from "@cinderfall/sim";
import { useGameStore } from "../../game/store";

export function ForgeTab() {
    const up = useGameStore((s) => s.snap?.up);
    const gold = useGameStore((s) => s.snap?.gold ?? 0);
    const dispatch = useGameStore((s) => s.dispatch);

    const total = Object.values(up ?? {}).reduce((a, b) => a + b, 0);

    return (
        <div className="upgrade-list">
            <div className="list-head">
                <span>
                    Gold: <b className="gold">{fn(gold)}</b>
                </span>
                <span className="mu">· {total} ranks this run</span>
            </div>
            <p className="mu note">
                Per-run upgrades. Spend before dying — forge ranks reset with gold.
            </p>

            {UPGRADES.map((upgrade) => {
                const rank = up?.[upgrade.id] ?? 0;
                const cost = upCost(upgrade, rank);
                const can = gold >= cost;
                const totalValue = rank ? upgrade.val * rank : 0;

                return (
                    <div
                        className={`upgrade-card${rank ? " has" : ""}`}
                        key={upgrade.id}
                    >
                        <div className="card-head">
                            <b>{upgrade.n}</b>
                            <span className="mu">
                                Rank {rank}
                                {rank
                                    ? ` · +${
                                          totalValue % 1
                                              ? totalValue.toFixed(1)
                                              : totalValue
                                      }${PCT.has(upgrade.stat) ? "%" : ""}`
                                    : ""}
                            </span>
                        </div>
                        <em>{upgrade.d}</em>
                        <div className="card-row">
                            <span>
                                Next: <b className="gold">{fn(cost)}g</b>
                            </span>
                            <button
                                className="sm"
                                disabled={!can}
                                onClick={() =>
                                    dispatch({
                                        type: "buyUpgrade",
                                        id: upgrade.id,
                                    })
                                }
                            >
                                Buy
                            </button>
                            <button
                                className="sm"
                                disabled={!can}
                                onClick={() =>
                                    dispatch({
                                        type: "buyUpgrade",
                                        id: upgrade.id,
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
