import { useEffect, useRef, useState } from "react";
import { fn } from "@cinderfall/sim";
import { fx } from "../../game/fx";
import { SKILL_ORDER } from "../../game/skills";
import { useGameStore } from "../../game/store";
import { Bar } from "../ui/Bar";
import { CombatLog } from "./CombatLog";
import { EnemyCard } from "./EnemyCard";
import { FxLayer } from "./FxLayer";
import { SkillBar } from "./SkillBar";

export function Arena() {
    const enemy = useGameStore((s) => s.snap?.enemy);
    const hp = useGameStore((s) => s.snap?.hp ?? 0);
    const maxHp = useGameStore((s) => s.snap?.maxHp ?? 1);
    const buff = useGameStore((s) => s.snap?.buff ?? 0);
    const stage = useGameStore((s) => s.snap?.stage ?? 1);
    const k = useGameStore((s) => s.snap?.k ?? 0);
    const dead = useGameStore((s) => s.snap?.dead ?? false);
    const dispatch = useGameStore((s) => s.dispatch);

    const [shake, setShake] = useState<"" | "shake" | "shake-big">("");
    const shakeTimer = useRef<number | undefined>(undefined);

    useEffect(
        () =>
            fx.subscribe((event) => {
                if (event.kind !== "hit" || event.crit < 1) return;
                setShake(event.crit >= 3 ? "shake-big" : "shake");
                window.clearTimeout(shakeTimer.current);
                shakeTimer.current = window.setTimeout(
                    () => setShake(""),
                    event.crit >= 3 ? 240 : 160,
                );
            }),
        [],
    );

    useEffect(() => () => window.clearTimeout(shakeTimer.current), []);

    // 1-9 cast the unlocked skills, in the same order as the buttons.
    useEffect(() => {
        const onKey = (event: KeyboardEvent): void => {
            const target = event.target;
            if (
                target instanceof HTMLInputElement ||
                target instanceof HTMLSelectElement ||
                target instanceof HTMLTextAreaElement
            ) {
                return;
            }
            const index = Number.parseInt(event.key, 10);
            if (!(index >= 1 && index <= 9)) return;

            const snap = useGameStore.getState().snap;
            if (!snap || snap.dead) return;
            const unlocked = SKILL_ORDER.filter((id) => snap.ranks[id]);
            const skill = unlocked[index - 1];
            if (skill) {
                useGameStore.getState().dispatch({ type: "cast", skill });
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    if (!enemy) return null;

    let status = enemy.boss
        ? "Defeat it to advance"
        : enemy.elite
          ? "Elite foe"
          : `${k}/5 foes`;
    let enraged = false;

    if (enemy.boss && enemy.age > 30) {
        const stacks = Math.floor((enemy.age - 30) / 15);
        status = `⚡ ENRAGED +${stacks * 50}% dmg`;
        enraged = true;
    }
    if (enemy.vuln > 0) status += ` · Vuln +${enemy.vuln}%`;

    const title = enemy.boss
        ? `Stage ${stage} boss`
        : `Stage ${stage}${enemy.elite ? " elite" : ""}`;

    const onStrike = (event: React.PointerEvent<HTMLDivElement>): void => {
        if (event.button !== 0 || dead) return;
        event.preventDefault();
        dispatch({ type: "strike" });
    };

    return (
        <section className="panel arena" aria-labelledby="arena-title">
            <div className="stage-line">
                <b id="arena-title">{title}</b>
                <span className={`mu${enraged ? " enraged" : ""}`}>{status}</span>
            </div>

            <div
                className={`field ${shake}`}
                onPointerDown={onStrike}
                onContextMenu={(e) => e.preventDefault()}
                role="button"
                tabIndex={0}
                aria-label="Strike the enemy"
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        if (!dead) dispatch({ type: "strike" });
                    }
                }}
            >
                <EnemyCard />
                <FxLayer />
            </div>

            <Bar value={hp} max={maxHp} tone="hp" className="player-bar" />
            <div className="mu hp-text">
                {fn(Math.max(0, hp))} / {fn(maxHp)} life
                {buff > 0 ? ` · Battle Cry ${Math.ceil(buff)}s` : ""}
            </div>

            <SkillBar />
            <CombatLog />

            <p className="mu hint">
                Left-click or tap the arena to strike. Bosses enrage after 30s.
                Vulnerability stacks make long fights speed up.
            </p>

            <details className="tips">
                <summary>💡 Optimization tips</summary>
                <ul>
                    <li>
                        <b>Devastation</b> (crit, multihit, vuln) and{" "}
                        <b>Ascension</b> (soul/forge scaling) both scale hard with
                        investment.
                    </li>
                    <li>
                        <b>Multihit</b> rolls a free second strike — huge with high
                        crit damage.
                    </li>
                    <li>
                        <b>Torment</b> doubles vuln stacking; <b>Doom</b> scales
                        damage with stacks.
                    </li>
                    <li>
                        <b>Soul Bond</b> + <b>Soul Ward</b> convert soul ranks into
                        damage and life — infinite scaling.
                    </li>
                    <li>
                        At ≥100% crit every hit crits; each extra 100% adds a
                        guaranteed tier.
                    </li>
                    <li>
                        Elites spawn 15% of the time: 2.5× HP, 1.4× damage, always
                        drop.
                    </li>
                    <li>
                        Spend gold in the <b>Forge</b> before dying; <b>Keeper</b>{" "}
                        retains some of it after rebirth.
                    </li>
                </ul>
            </details>
        </section>
    );
}
