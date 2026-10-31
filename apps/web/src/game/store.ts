import { create } from "zustand";
import {
    R,
    calc,
    type Action,
    type Item,
    type SimEvent,
} from "@cinderfall/sim";
import { engine } from "./engine";
import { buildSnapshot, type Snapshot } from "./snapshot";
import { fx } from "./fx";

export type TabId = "gear" | "tree" | "forge" | "souls";
export type ToastKind = "info" | "soul" | "gold" | "boss" | "loot" | "elite";

export interface LogEntry {
    id: number;
    text: string;
    color?: string;
}

export interface Toast {
    id: number;
    text: string;
    kind: ToastKind;
}

export interface Comparison {
    dps: number;
    hp: number;
    armor: number;
}

interface GameStore {
    snap: Snapshot | null;
    log: LogEntry[];
    toasts: Toast[];
    selected: number | null;
    tab: TabId;
    started: boolean;

    start: () => void;
    stop: () => void;
    dispatch: (action: Action) => void;
    select: (id: number | null) => void;
    setTab: (tab: TabId) => void;
    pushToast: (text: string, kind?: ToastKind) => void;
    dismissToast: (id: number) => void;
    compare: (item: Item) => Comparison | null;
    reset: () => void;
}

let seq = 0;
const nextId = (): number => ++seq;

const ERROR_TEXT: Record<string, string> = {
    gold: "Not enough gold",
    shards: "Not enough soul shards",
    points: "No skill points available",
    full: "Your bag is full (30 items)",
    locked: "Requires an earlier node",
    invalid: "Not possible",
};

function addLog(text: string, color?: string): void {
    useGameStore.setState((s) => ({
        log: [...s.log, { id: nextId(), text, color }].slice(-6),
    }));
}

function addToast(text: string, kind: ToastKind = "info"): void {
    useGameStore.setState((s) => ({
        toasts: [...s.toasts, { id: nextId(), text, kind }].slice(-4),
    }));
}

function flashLevelUp(): void {
    if (typeof document === "undefined") return;
    document.body.classList.add("levelup");
    setTimeout(() => document.body.classList.remove("levelup"), 650);
}

function handleEvents(events: SimEvent[]): void {
    for (const event of events) {
        switch (event.t) {
            case "hit":
                fx.hit(event);
                break;
            case "playerHit":
                fx.playerHit(event.dmg);
                break;
            case "thorns":
                fx.thorns(event.dmg);
                break;
            case "kill":
                addLog(`${event.name} slain: +${event.gold} gold`, "var(--mu)");
                fx.burst();
                break;
            case "drop":
                if (event.sold) {
                    addLog(`Sold ${event.item.name} for ${event.gold}g`, "var(--mu)");
                } else {
                    addLog(`Loot: ${event.item.name}`, R[event.item.ri].c);
                    if (event.item.ri >= 2) {
                        addToast(
                            `${R[event.item.ri].n} loot: ${event.item.name}`,
                            "loot",
                        );
                    }
                }
                break;
            case "levelup":
                addLog(`Level ${event.level}! You gain a skill point.`, "#6fb3ff");
                addToast(`⬆ Level ${event.level} — skill point earned!`, "soul");
                flashLevelUp();
                break;
            case "death":
                addLog("You fell. Your soul shards are waiting.", "var(--dn)");
                break;
            case "milestone":
                addLog(
                    `Milestone: stage ${event.stage} — +${event.shards} soul shards`,
                    "var(--sh)",
                );
                addToast(`🏆 Milestone! +${event.shards} soul shards`, "soul");
                break;
            case "rebirth":
                addLog(
                    `Reborn with ${event.shards} shard${event.shards === 1 ? "" : "s"}${
                        event.keepGold ? ` + ${event.keepGold}g kept` : ""
                    }.`,
                    "var(--sh)",
                );
                addToast(
                    `✹ +${event.shards} shard${event.shards === 1 ? "" : "s"}`,
                    "soul",
                );
                break;
            case "warn":
                fx.warn(event.msg);
                break;
            case "sell":
                addLog(
                    event.count > 1
                        ? `Sold ${event.count} items for ${event.gold} gold.`
                        : `Sold for ${event.gold} gold.`,
                    "var(--mu)",
                );
                break;
            case "reroll":
                addLog(
                    `🎲 Rerolled ${event.name} for ${event.gold}g.`,
                    "var(--goldc)",
                );
                addToast(`🎲 Rerolled ${event.name}`, "gold");
                break;
            case "equipBest":
                addLog(
                    `Equipped ${event.swaps} upgrade${event.swaps === 1 ? "" : "s"}.`,
                    "var(--up)",
                );
                break;
            case "respec":
                addLog(`Respecced: ${event.points} points refunded.`);
                break;
            case "error":
                addToast(ERROR_TEXT[event.code] ?? "Not possible", "boss");
                break;
            case "buy":
            case "equip":
            case "unequip":
            case "skill":
            case "spawn":
                break;
        }
    }
}

let subscribed = false;

/** Subscribe once, lazily: dispatch works even before the page mounts. */
function ensureSubscribed(): void {
    if (subscribed) return;
    subscribed = true;
    engine.subscribe((state, events) => {
        useGameStore.setState({ snap: buildSnapshot(state) });
        if (events.length) handleEvents(events);
    });
}

export const useGameStore = create<GameStore>((set, get) => ({
    snap: null,
    log: [],
    toasts: [],
    selected: null,
    tab: "gear",
    started: false,

    start() {
        ensureSubscribed();
        if (!get().started) {
            const state = engine.boot();
            set({ started: true, snap: buildSnapshot(state) });
        }
        engine.start();
    },

    stop() {
        engine.stop();
    },

    dispatch(action) {
        ensureSubscribed();
        engine.dispatch(action);
    },

    select(id) {
        set({ selected: id, tab: "gear" });
    },

    setTab(tab) {
        set({ tab });
    },

    pushToast(text, kind = "info") {
        addToast(text, kind);
    },

    dismissToast(id) {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    },

    compare(item) {
        const state = engine.current;
        if (!state) return null;
        if (state.eq[item.slot]?.id === item.id) return null;

        const base = calc(state);
        const next = calc(state, { ...state.eq, [item.slot]: item });
        const pct = (a: number, b: number): number =>
            b > 0 ? (a / b - 1) * 100 : 0;

        return {
            dps: pct(next.dps, base.dps),
            hp: pct(next.maxHp, base.maxHp),
            armor: pct(next.armor, Math.max(1, base.armor)),
        };
    },

    reset() {
        ensureSubscribed();
        const state = engine.reset();
        set({
            snap: buildSnapshot(state),
            log: [],
            toasts: [],
            selected: null,
            tab: "gear",
        });
    },
}));
