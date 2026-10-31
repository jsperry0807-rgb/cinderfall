import type { CSSProperties } from "react";
import { ICON, R, SLOTS } from "@cinderfall/sim";
import { useGameStore } from "../../game/store";

export function EquipmentGrid() {
    const eq = useGameStore((s) => s.snap?.eq);
    const selected = useGameStore((s) => s.selected);
    const select = useGameStore((s) => s.select);

    return (
        <div className="equipment" aria-label="Equipped items">
            {SLOTS.map((slot) => {
                const item = eq?.[slot];
                if (!item) {
                    return (
                        <div key={slot} className="slot empty" title={slot}>
                            {ICON[slot]}
                        </div>
                    );
                }
                return (
                    <button
                        key={slot}
                        type="button"
                        className={`slot${selected === item.id ? " sel" : ""}`}
                        style={{ "--c": R[item.ri].c } as CSSProperties}
                        title={item.name}
                        onClick={() => select(item.id)}
                    >
                        {ICON[slot]}
                        <small>{item.il}</small>
                    </button>
                );
            })}
        </div>
    );
}
