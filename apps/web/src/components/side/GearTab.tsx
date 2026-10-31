import { useEffect, useState, type CSSProperties } from "react";
import { ICON, R, fn, itemValue } from "@cinderfall/sim";
import { useGameStore } from "../../game/store";
import { ItemCard } from "./ItemCard";

export function GearTab() {
    const inv = useGameStore((s) => s.snap?.inv);
    const eq = useGameStore((s) => s.snap?.eq);
    const stats = useGameStore((s) => s.snap?.stats);
    const autoSell = useGameStore((s) => s.snap?.as ?? 0);
    const selected = useGameStore((s) => s.selected);
    const select = useGameStore((s) => s.select);
    const dispatch = useGameStore((s) => s.dispatch);

    const [armed, setArmed] = useState(false);

    useEffect(() => {
        if (!armed) return;
        const timer = window.setTimeout(() => setArmed(false), 4_000);
        return () => window.clearTimeout(timer);
    }, [armed]);

    const items = inv ?? [];
    const total = items.reduce(
        (a, item) => a + itemValue(item, stats ?? null),
        0,
    );
    const selectedItem =
        items.find((i) => i.id === selected) ??
        Object.values(eq ?? {}).find((i) => i?.id === selected) ??
        null;

    const onSellAll = (): void => {
        if (!armed) {
            setArmed(true);
            return;
        }
        setArmed(false);
        dispatch({ type: "sellAll" });
    };

    return (
        <div className="gear-tab">
            <div className="bag" aria-label="Bag">
                {items.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        className={`cell${selected === item.id ? " sel" : ""}`}
                        style={{ "--c": R[item.ri].c } as CSSProperties}
                        title={item.name}
                        onClick={() => select(item.id)}
                    >
                        {ICON[item.slot]}
                        <small>{item.il}</small>
                    </button>
                ))}
                {Array.from(
                    { length: Math.max(0, 30 - items.length) },
                    (_, index) => (
                        <div key={`empty-${index}`} className="cell empty" />
                    ),
                )}
            </div>

            {selectedItem && <ItemCard item={selectedItem} />}

            <div className="row">
                <label>
                    Auto-sell below{" "}
                    <select
                        value={autoSell}
                        onChange={(e) =>
                            dispatch({
                                type: "setAutoSell",
                                rarity: Number(e.target.value),
                            })
                        }
                    >
                        {R.slice(0, 6).map((rarity, index) => (
                            <option key={rarity.n} value={index}>
                                {index ? rarity.n : "Nothing"}
                            </option>
                        ))}
                    </select>
                </label>
                <button
                    className="sm"
                    onClick={() => dispatch({ type: "sellBelow" })}
                >
                    Sell below
                </button>
            </div>

            <div className="row">
                <button
                    className="btn"
                    disabled={items.length === 0}
                    onClick={() => dispatch({ type: "equipBest" })}
                >
                    Equip best
                </button>
                <button
                    className={`btn${armed ? " danger" : ""}`}
                    disabled={items.length === 0}
                    onClick={onSellAll}
                >
                    {armed
                        ? `Click again to sell all (${fn(total)}g)`
                        : `Sell all (${fn(total)}g)`}
                </button>
            </div>
        </div>
    );
}
