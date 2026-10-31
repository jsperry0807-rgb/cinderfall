import { fn } from "@cinderfall/sim";
import { critStr, dropStr } from "../../game/format";
import { useGameStore } from "../../game/store";

export function StatSheet() {
    const stats = useGameStore((s) => s.snap?.stats);
    const shards = useGameStore((s) => s.snap?.shards ?? 0);
    const best = useGameStore((s) => s.snap?.best ?? 1);
    const elites = useGameStore((s) => s.snap?.elites ?? 0);
    const souls = useGameStore((s) => s.snap?.souls);
    const up = useGameStore((s) => s.snap?.up);

    if (!stats) return null;

    const soulRanks = Object.values(souls ?? {}).reduce((a, b) => a + b, 0);
    const forgeRanks = Object.values(up ?? {}).reduce((a, b) => a + b, 0);
    const g = stats.g;

    const rows: Array<[string, string]> = [
        ["Damage", fn(stats.dmg)],
        ["Attacks/s", stats.aps.toFixed(2)],
        ["DPS", fn(stats.dps)],
        ["Crit", critStr(stats)],
        ["Life", fn(stats.maxHp)],
        ["Armor", fn(stats.armor)],
        ["Regen", `${g("regen").toFixed(1)}/s`],
        ["Life steal", `${g("ls").toFixed(0)}%`],
        ["Gold find", `+${g("gold").toFixed(0)}%`],
        ["Magic find", `+${g("mf").toFixed(0)}%`],
        ["XP gain", `+${g("xp").toFixed(0)}%`],
        ["Drop", dropStr(stats)],
        ["Multihit", `${stats.multihit.toFixed(0)}%`],
        ["Soul shards", String(shards)],
        ["Soul ranks", String(soulRanks)],
        ["Forge ranks", String(forgeRanks)],
        ["Elite kills", String(elites)],
        ["Best stage", String(best)],
    ];

    return (
        <ul className="stats">
            {rows.map(([label, value]) => (
                <li key={label}>
                    <span>{label}</span>
                    <b>{value}</b>
                </li>
            ))}
        </ul>
    );
}
