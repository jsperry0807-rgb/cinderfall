// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
    createGame,
    genItem,
    mulberry32,
    type SimState,
} from "@cinderfall/sim";
import { engine } from "../src/game/engine";
import { buildSnapshot, resetSnapshotCache } from "../src/game/snapshot";
import { useGameStore } from "../src/game/store";
import { useAuth } from "../src/stores/auth";
import { TopBar } from "../src/components/TopBar";
import { HeroPanel } from "../src/components/hero/HeroPanel";
import { Arena } from "../src/components/arena/Arena";
import { SidePanel } from "../src/components/side/SidePanel";
import {
    AUTO_REBIRTH_SECONDS,
    DeathModal,
} from "../src/components/modals/DeathModal";

function seed(mutate?: (state: SimState) => void): SimState {
    resetSnapshotCache();
    const rng = mulberry32(42);
    const { state } = createGame(rng);
    state.lvl = 3;
    state.gold = 1234;
    state.stage = 4;
    mutate?.(state);
    engine.load(state);
    useGameStore.setState({
        snap: buildSnapshot(state),
        log: [],
        toasts: [],
        selected: null,
        tab: "gear",
        started: true,
    });
    return state;
}

function renderGame() {
    return render(
        <MemoryRouter>
            <TopBar />
            <HeroPanel />
            <Arena />
            <SidePanel />
        </MemoryRouter>,
    );
}

beforeEach(() => {
    useAuth.setState({
        status: "guest",
        user: {
            id: "test-player",
            email: null,
            displayName: "Wanderer-TEST",
            isGuest: true,
            emailVerified: false,
            createdAt: new Date().toISOString(),
        },
        csrf: "csrf",
        error: null,
        bootstrapped: true,
    });
});

afterEach(() => {
    cleanup();
});

describe("game shell", () => {
    it("renders the header, hero, arena and side panel", () => {
        const state = seed();
        renderGame();

        expect(screen.getByText("Cinderfall")).toBeTruthy();
        expect(screen.getByText("Level 3")).toBeTruthy();
        expect(screen.getByText("◈ 1234")).toBeTruthy();
        expect(screen.getByText("Damage")).toBeTruthy();
        expect(screen.getByText(state.enemy.name)).toBeTruthy();
        expect(screen.getByText("Stage 4")).toBeTruthy();
        expect(screen.getAllByRole("tab")).toHaveLength(4);
        expect(screen.getByRole("tab", { name: /Gear/ })).toBeTruthy();
    });

    it("switches tabs", () => {
        seed();
        renderGame();

        fireEvent.click(screen.getByRole("tab", { name: /Skills/ }));
        expect(screen.getByText("Skill points:")).toBeTruthy();
        expect(screen.getByText("Carnage")).toBeTruthy();

        fireEvent.click(screen.getByRole("tab", { name: /Forge/ }));
        expect(screen.getByText("Sharpness")).toBeTruthy();

        fireEvent.click(screen.getByRole("tab", { name: /Souls/ }));
        expect(screen.getByText("Wrath")).toBeTruthy();

        fireEvent.click(screen.getByRole("tab", { name: /Gear/ }));
        expect(screen.getByRole("tab", { name: /Gear/ })).toBeTruthy();
    });

    it("shows the selected item card", () => {
        const rng = mulberry32(7);
        let itemName = "";
        const state = seed((s) => {
            const item = genItem(s, 10, 0, rng);
            itemName = item.name;
            s.inv = [item];
        });
        renderGame();

        fireEvent.click(screen.getByTitle(itemName));
        expect(useGameStore.getState().selected).toBe(state.inv[0]!.id);
        expect(screen.getByText("Equip")).toBeTruthy();
        expect(screen.getByText(/Reroll/)).toBeTruthy();
    });

    it("shows the death modal with pending shards", () => {
        seed((s) => {
            s.dead = true;
            s.pend = 12;
            s.shards = 3;
        });
        render(
            <MemoryRouter>
                <DeathModal />
            </MemoryRouter>,
        );

        expect(screen.getByText("You Died")).toBeTruthy();
        expect(screen.getByText(/12 shards/)).toBeTruthy();
        expect(screen.getByText(/Total after rebirth: 15/)).toBeTruthy();
        expect(
            screen.getByRole("button", { name: /Rise from the ashes/ }),
        ).toBeTruthy();
    });

    it("resumes the idle loop automatically after death", () => {
        vi.useFakeTimers();
        try {
            seed((s) => {
                s.dead = true;
                s.pend = 12;
            });
            render(
                <MemoryRouter>
                    <DeathModal />
                </MemoryRouter>,
            );

            expect(screen.getByText(/Rising automatically in/)).toBeTruthy();
            expect(useGameStore.getState().snap?.dead).toBe(true);

            act(() => {
                vi.advanceTimersByTime(AUTO_REBIRTH_SECONDS * 1000);
            });

            expect(useGameStore.getState().snap?.dead).toBe(false);
        } finally {
            vi.useRealTimers();
        }
    });
});

describe("snapshot caching", () => {
    it("reuses unchanged slices between ticks", () => {
        const state = seed();
        const a = buildSnapshot(state);
        state.hp -= 1;
        const b = buildSnapshot(state);

        expect(b.hp).toBeLessThan(a.hp);
        expect(b.stats).toBe(a.stats);
        expect(b.inv).toBe(a.inv);
        expect(b.ranks).toBe(a.ranks);

        state.ranks.brut = 1;
        const c = buildSnapshot(state);
        expect(c.ranks).not.toBe(b.ranks);
        expect(c.ranks.brut).toBe(1);
    });
});

describe("store dispatch", () => {
    it("applies an action against the loaded engine state", () => {
        seed((s) => {
            s.lvl = 10;
            s.ranks = {};
        });

        useGameStore.getState().dispatch({ type: "buyNode", id: "brut" });
        expect(engine.current?.ranks.brut).toBe(1);
        expect(useGameStore.getState().snap?.ranks.brut).toBe(1);
    });

    it("reports errors as toasts", () => {
        seed((s) => {
            s.shards = 0;
        });
        useGameStore.setState({ toasts: [] });

        useGameStore.getState().dispatch({ type: "buySoul", id: "wrath" });

        const toasts = useGameStore.getState().toasts;
        expect(toasts).toHaveLength(1);
        expect(toasts[0]!.text).toBe("Not enough soul shards");
        expect(toasts[0]!.kind).toBe("boss");
    });
});
