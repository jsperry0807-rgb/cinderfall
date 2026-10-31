// Ephemeral combat effects. These never go through React state: the FX layer
// subscribes and appends DOM nodes directly, like the old build did.

export type FxEvent =
    | { kind: "hit"; dmg: number; crit: number; multihit: boolean }
    | { kind: "playerHit"; dmg: number }
    | { kind: "thorns"; dmg: number }
    | { kind: "burst" }
    | { kind: "warn"; msg: string };

type Listener = (event: FxEvent) => void;

const listeners = new Set<Listener>();

function emit(event: FxEvent): void {
    for (const fn of listeners) fn(event);
}

export const fx = {
    hit(event: { dmg: number; crit: number; multihit: boolean }): void {
        emit({ kind: "hit", ...event });
    },
    playerHit(dmg: number): void {
        emit({ kind: "playerHit", dmg });
    },
    thorns(dmg: number): void {
        emit({ kind: "thorns", dmg });
    },
    burst(): void {
        emit({ kind: "burst" });
    },
    warn(msg: string): void {
        emit({ kind: "warn", msg });
    },
    subscribe(fn: Listener): () => void {
        listeners.add(fn);
        return () => {
            listeners.delete(fn);
        };
    },
};
