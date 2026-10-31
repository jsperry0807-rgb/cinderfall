// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createGame, mulberry32 } from "@cinderfall/sim";
import { OfflineModal } from "../src/components/modals/OfflineModal";
import { engine } from "../src/game/engine";
import { useAuth } from "../src/stores/auth";
import { useSync } from "../src/stores/sync";

const json = (body: unknown): Response =>
    new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
    });

beforeEach(() => {
    useAuth.setState({
        status: "guest",
        user: {
            id: "guest-sync",
            email: null,
            displayName: "Wanderer-SYNC",
            isGuest: true,
            emailVerified: false,
            createdAt: new Date().toISOString(),
        },
        csrf: "csrf",
        sessions: [],
        error: null,
        bootstrapped: true,
    });
    useSync.setState({
        status: "idle",
        revision: 0,
        lastSavedAt: null,
        away: null,
        error: null,
    });
});

afterEach(() => {
    cleanup();
    useSync.getState().stop();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("offline summary", () => {
    it("renders the catch-up and dismisses", () => {
        useSync.setState({
            away: {
                seconds: 7_320,
                skipped: 0,
                kills: 42,
                drops: 6,
                levels: 2,
                stages: 3,
                gold: 12_340,
                shards: 5,
                died: false,
            },
        });

        render(<OfflineModal />);

        expect(screen.getByText("While you were away")).toBeTruthy();
        expect(screen.getByText("2h 2m of progress")).toBeTruthy();
        expect(screen.getByText("42")).toBeTruthy();
        expect(screen.getByText("12.3k")).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "Continue" }));
        expect(useSync.getState().away).toBeNull();
    });

    it("reports a death while away", () => {
        useSync.setState({
            away: {
                seconds: 600,
                skipped: 0,
                kills: 1,
                drops: 0,
                levels: 0,
                stages: 0,
                gold: 3,
                shards: 0,
                deaths: 3,
                died: true,
            },
        });

        render(<OfflineModal />);
        expect(screen.getByText(/fell 3 times/i)).toBeTruthy();
    });
});

describe("sync pull", () => {
    it("adopts the server state and revision", async () => {
        const rng = mulberry32(1);
        const remote = createGame(rng).state;
        remote.lvl = 7;
        remote.gold = 500;

        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                json({
                    state: remote,
                    revision: 9,
                    simClock: 123,
                    lastSimAt: new Date().toISOString(),
                    away: null,
                }),
            ),
        );

        await useSync.getState().start();

        expect(engine.current?.lvl).toBe(7);
        expect(engine.simClock).toBe(123);
        expect(useSync.getState().revision).toBe(9);
        expect(useSync.getState().status).toBe("saved");
    });

    it("handles an unreachable API without throwing", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                throw new Error("network down");
            }),
        );

        await useSync.getState().start();

        expect(useSync.getState().status).toBe("offline");
        expect(engine.current).toBeTruthy();
    });
});
