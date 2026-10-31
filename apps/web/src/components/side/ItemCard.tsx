import type { CSSProperties } from "react";
import {
    R,
    SN,
    fn,
    fmtN,
    fmtS,
    itemValue,
    rerollCost,
    type Item,
    type StatKey,
} from "@cinderfall/sim";
import { signedPct, tone } from "../../game/format";
import { statMap } from "../../game/items";
import { useGameStore } from "../../game/store";

export function ItemCard({ item }: { item: Item }) {
    const eq = useGameStore((s) => s.snap?.eq);
    const stats = useGameStore((s) => s.snap?.stats);
    const gold = useGameStore((s) => s.snap?.gold ?? 0);
    const dispatch = useGameStore((s) => s.dispatch);
    const compare = useGameStore((s) => s.compare);

    const current = eq?.[item.slot];
    const equipped = current?.id === item.id;
    const cmp = compare(item);
    const cost = rerollCost(item);

    const map = statMap(item);
    const curMap = current && !equipped ? statMap(current) : {};
    const keys = [
        ...new Set([...Object.keys(map), ...Object.keys(curMap)]),
    ] as StatKey[];

    return (
        <div
            className="item-card"
            style={{ "--c": R[item.ri].c } as CSSProperties}
        >
            <h4>{item.name}</h4>
            <div className="meta">
                {R[item.ri].n} {item.slot} · ilvl {item.il}
                {equipped
                    ? " · equipped"
                    : current
                      ? ` · vs ${current.name}`
                      : " · slot empty"}
                {item.rr ? ` · rerolled ${item.rr}×` : ""}
            </div>

            <div className="affixes">
                {keys.length === 0 ? (
                    <p className="mu">No affixes.</p>
                ) : (
                    keys.map((key) => {
                        const value = map[key] ?? 0;
                        const delta = value - (curMap[key] ?? 0);
                        return (
                            <div className="affix" key={key}>
                                <span>
                                    {value ? (
                                        fmtS(key, value)
                                    ) : (
                                        <span className="mu">{SN[key]} —</span>
                                    )}
                                </span>
                                {current && Math.abs(delta) > 1e-9 ? (
                                    <b className={delta > 0 ? "up" : "dn"}>
                                        {fmtN(key, delta)}
                                    </b>
                                ) : null}
                            </div>
                        );
                    })
                )}
            </div>

            {cmp && (
                <div className="compare">
                    <span className={tone(cmp.dps)}>
                        DPS {signedPct(cmp.dps)}
                    </span>
                    <span className={tone(cmp.hp)}>
                        Life {signedPct(cmp.hp)}
                    </span>
                    <span className={tone(cmp.armor)}>
                        Armor {signedPct(cmp.armor)}
                    </span>
                </div>
            )}

            <div className="btns">
                {equipped ? (
                    <button
                        className="btn"
                        onClick={() => dispatch({ type: "unequip", slot: item.slot })}
                    >
                        Unequip
                    </button>
                ) : (
                    <button
                        className="btn"
                        onClick={() => dispatch({ type: "equip", itemId: item.id })}
                    >
                        Equip
                    </button>
                )}

                {!equipped && (
                    <button
                        className="btn"
                        onClick={() => dispatch({ type: "sell", itemId: item.id })}
                    >
                        Sell {itemValue(item, stats ?? null)}g
                    </button>
                )}

                <button
                    className="sm"
                    disabled={gold < cost}
                    onClick={() => dispatch({ type: "reroll", itemId: item.id })}
                >
                    🎲 Reroll ({fn(cost)}g)
                </button>
            </div>
        </div>
    );
}
