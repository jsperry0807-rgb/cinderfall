import { fn } from "@cinderfall/sim";
import { useGameStore } from "../../game/store";
import { Bar } from "../ui/Bar";

export function EnemyCard() {
    const enemy = useGameStore((s) => s.snap?.enemy);

    if (!enemy) return null;
    const tone = enemy.boss ? "boss" : enemy.elite ? "elite" : "";

    return (
        <div className={`enemy ${tone}`}>
            <div className="face" aria-hidden="true">
                {enemy.face}
            </div>
            <div className="ename">{enemy.name}</div>
            <Bar value={enemy.hp} max={enemy.max} tone="foe" />
            <div className="mu enemy-hp">
                {fn(Math.max(0, enemy.hp))} / {fn(enemy.max)}
            </div>
        </div>
    );
}
