// Cloud-save synchronisation.
//
// The client simulates locally while the tab is open; this module pulls the
// server save on boot (which may contain server-computed offline progress) and
// pushes the local state every few seconds. The server is canonical on conflict.

import { create } from "zustand";
import type { SimState } from "@cinderfall/sim";
import { ApiError, api } from "../net/api";
import { engine } from "../game/engine";
import { useGameStore } from "../game/store";
import { useAuth } from "./auth";

export interface AwaySummary {
    seconds: number;
    skipped: number;
    kills: number;
    drops: number;
    levels: number;
    stages: number;
    gold: number;
    shards: number;
    died: boolean;
}

interface RemoteSave {
    state: SimState;
    revision: number;
    simClock: number;
    lastSimAt: string;
    away: AwaySummary | null;
}

interface PushResult {
    revision: number;
    simClock: number;
    updatedAt: string;
}

interface SyncState {
    status: "idle" | "syncing" | "saved" | "offline" | "conflict";
    revision: number;
    lastSavedAt: number | null;
    away: AwaySummary | null;
    error: string | null;

    start: () => Promise<void>;
    stop: () => void;
    dismissAway: () => void;
}

const PUSH_EVERY_MS = 5_000;
const RETRY_MS = 15_000;

let started = false;
let timer: number | undefined;
let retryTimer: number | undefined;
let inFlight = false;
let revision = 0;

const message = (err: unknown): string =>
    err instanceof Error ? err.message : "Sync failed";

function scheduleRetry(): void {
    if (retryTimer !== undefined) return;
    retryTimer = window.setTimeout(() => {
        retryTimer = undefined;
        if (started) void pull();
    }, RETRY_MS);
}

/** Push the current state. `force` bypasses the "nothing new" guard. */
async function push(force = false): Promise<void> {
    if (inFlight) return;
    const state = engine.current;
    if (!state || revision < 1) return;
    if (!force && !started) return;

    const csrf = useAuth.getState().csrf;
    inFlight = true;
    useSync.setState({ status: "syncing", error: null });

    try {
        const result = await api.put<PushResult>(
            "/api/game/state",
            {
                state,
                simClock: engine.simClock,
                expectedRevision: revision,
            },
            csrf,
        );
        revision = result.revision;
        useSync.setState({
            revision,
            status: "saved",
            lastSavedAt: Date.now(),
            error: null,
        });
    } catch (err) {
        if (err instanceof ApiError && err.status === 409 && err.details) {
            const details = err.details as {
                state?: SimState;
                revision?: number;
                simClock?: number;
            };
            if (details.state) {
                engine.load(details.state, details.simClock ?? 0);
                revision = details.revision ?? revision;
                useSync.setState({ revision, status: "conflict" });
                useGameStore
                    .getState()
                    .pushToast("Save updated elsewhere — reloaded", "soul");
                return;
            }
        }

        useSync.setState({ status: "offline", error: message(err) });
        scheduleRetry();
    } finally {
        inFlight = false;
    }
}

/** GET the server save, migrate a local preview if the server is pristine. */
async function pull(): Promise<void> {
    useSync.setState({ status: "syncing", error: null });

    try {
        const remote = await api.get<RemoteSave>("/api/game/state");
        revision = remote.revision;

        const local = engine.current;
        const localHasProgress =
            !!local &&
            (local.lvl > 1 ||
                local.gold > 0 ||
                local.stage > 1 ||
                engine.simClock > 0);

        const remoteState = remote.state as Partial<SimState> | null;
        const pristine =
            remote.revision === 1 &&
            remote.simClock === 0 &&
            (remoteState?.lvl ?? 1) === 1 &&
            (remoteState?.gold ?? 0) === 0 &&
            (remoteState?.stage ?? 1) === 1;

        if (pristine && localHasProgress) {
            // Carry an M2/M3 browser run into the new server save once.
            await push(true);
            return;
        }

        engine.load(remote.state, remote.simClock);
        useSync.setState({
            revision: remote.revision,
            status: "saved",
            lastSavedAt: Date.now(),
            away: remote.away ?? null,
            error: null,
        });
    } catch (err) {
        useSync.setState({ status: "offline", error: message(err) });
        scheduleRetry();
    }
}

/** Best-effort save on tab hide/unload. */
function flush(): void {
    const state = engine.current;
    const csrf = useAuth.getState().csrf;
    if (!state || revision < 1) return;

    void fetch("/api/game/state", {
        method: "PUT",
        credentials: "include",
        keepalive: true,
        headers: {
            "content-type": "application/json",
            ...(csrf ? { "x-csrf-token": csrf } : {}),
        },
        body: JSON.stringify({
            state,
            simClock: engine.simClock,
            expectedRevision: revision,
        }),
    }).catch(() => {
        // The next periodic push will retry.
    });
}

export const useSync = create<SyncState>((set) => ({
    status: "idle",
    revision: 0,
    lastSavedAt: null,
    away: null,
    error: null,

    async start() {
        if (started) return;
        const auth = useAuth.getState();
        if (auth.status !== "guest" && auth.status !== "user") {
            if (auth.status === "offline") set({ status: "offline" });
            return;
        }

        started = true;
        await pull();
        if (!started) return;

        window.clearInterval(timer);
        timer = window.setInterval(() => void push(), PUSH_EVERY_MS);
    },

    stop() {
        started = false;
        window.clearInterval(timer);
        timer = undefined;
        window.clearTimeout(retryTimer);
        retryTimer = undefined;
        flush();
    },

    dismissAway() {
        set({ away: null });
    },
}));
