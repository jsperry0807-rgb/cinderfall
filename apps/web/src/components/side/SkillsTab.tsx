import { BR, NODES } from "@cinderfall/sim";
import { useGameStore } from "../../game/store";

export function SkillsTab() {
    const ranks = useGameStore((s) => s.snap?.ranks);
    const sp = useGameStore((s) => s.snap?.sp ?? 0);
    const spSpent = useGameStore((s) => s.snap?.spSpent ?? 0);
    const gold = useGameStore((s) => s.snap?.gold ?? 0);
    const lvl = useGameStore((s) => s.snap?.lvl ?? 1);
    const dispatch = useGameStore((s) => s.dispatch);

    const respecCost = lvl * 50;

    return (
        <div className="tree">
            <div className="tree-head">
                <span>
                    Skill points: <b>{sp}</b>
                    <span className="mu"> · {spSpent} spent</span>
                </span>
                <button
                    className="sm"
                    disabled={spSpent === 0 || gold < respecCost}
                    onClick={() => dispatch({ type: "respec" })}
                >
                    Respec ({respecCost}g)
                </button>
            </div>

            {BR.map((branch, branchIndex) => {
                const nodes = NODES.filter((n) => n.b === branchIndex);
                const total = nodes.reduce(
                    (a, n) => a + (ranks?.[n.id] ?? 0),
                    0,
                );

                return (
                    <section className="branch" key={branch}>
                        <h3>
                            {branch}{" "}
                            <span className="mu">({total} ranks)</span>
                        </h3>
                        <div className="branch-list">
                            {nodes.map((node) => {
                                const rank = ranks?.[node.id] ?? 0;
                                const cost = node.cost ?? 1;
                                const locked =
                                    !!node.req && !ranks?.[node.req];
                                const can =
                                    !locked &&
                                    rank < node.max &&
                                    sp >= cost;
                                const reqName = node.req
                                    ? NODES.find((n) => n.id === node.req)?.n
                                    : null;

                                return (
                                    <button
                                        key={node.id}
                                        type="button"
                                        className={`node${rank ? " has" : ""}`}
                                        disabled={!can}
                                        onClick={() =>
                                            dispatch({
                                                type: "buyNode",
                                                id: node.id,
                                            })
                                        }
                                    >
                                        <b>{node.n}</b>
                                        <span>
                                            {rank}/{node.max}
                                        </span>
                                        <em>
                                            {node.d}
                                            {cost > 1 ? ` · ${cost} pts` : ""}
                                            {locked
                                                ? ` · Requires ${reqName}`
                                                : ""}
                                        </em>
                                    </button>
                                );
                            })}
                        </div>
                    </section>
                );
            })}
        </div>
    );
}
