import type { CSSProperties } from "react";
import { SK } from "@cinderfall/sim";
import { SKILL_ORDER } from "../../game/skills";
import { useGameStore } from "../../game/store";

export function SkillBar() {
    const ranks = useGameStore((s) => s.snap?.ranks);
    const cd = useGameStore((s) => s.snap?.cd);
    const dispatch = useGameStore((s) => s.dispatch);

    const unlocked = SKILL_ORDER.filter((id) => ranks?.[id]);

    if (unlocked.length === 0) {
        return (
            <div className="skills empty">
                <span className="mu">
                    Unlock skills in the Carnage and Bulwark branches.
                </span>
            </div>
        );
    }

    return (
        <div className="skills">
            {unlocked.map((id, index) => {
                const total = SK[id].cd;
                const left = cd?.[id] ?? 0;
                const pct = total > 0 ? (left / total) * 100 : 0;
                return (
                    <button
                        key={id}
                        type="button"
                        className="skill"
                        disabled={left > 0}
                        onClick={() => dispatch({ type: "cast", skill: id })}
                        style={{ "--cd": `${pct}%` } as CSSProperties}
                    >
                        <b>
                            {index + 1}. {SK[id].n}
                        </b>
                        <i>{left > 0 ? `${Math.ceil(left)}s` : "Ready"}</i>
                    </button>
                );
            })}
        </div>
    );
}
