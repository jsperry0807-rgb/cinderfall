import { Link } from "react-router-dom";
import { fn } from "@cinderfall/sim";
import { useGameStore } from "../game/store";
import { useAuth } from "../stores/auth";
import { useSync } from "../stores/sync";
import { Bar } from "./ui/Bar";

export function TopBar() {
    const lvl = useGameStore((s) => s.snap?.lvl ?? 1);
    const xp = useGameStore((s) => s.snap?.xp ?? 0);
    const xpNeed = useGameStore((s) => s.snap?.xpNeed ?? 1);
    const gold = useGameStore((s) => s.snap?.gold ?? 0);
    const shards = useGameStore((s) => s.snap?.shards ?? 0);

    const status = useAuth((s) => s.status);
    const user = useAuth((s) => s.user);
    const syncStatus = useSync((s) => s.status);
    const lastSavedAt = useSync((s) => s.lastSavedAt);

    const label =
        status === "offline"
            ? "Offline"
            : status === "loading"
              ? "Connecting…"
              : user?.isGuest
                ? "Guest"
                : (user?.displayName ?? "Account");

    return (
        <header className="topbar">
            <Link to="/" className="brand">
                Cinderfall
            </Link>

            <span className="level">Level {lvl}</span>

            <div className="xp-wrap">
                <Bar value={xp} max={xpNeed} tone="xp" />
                <span className="xp-text">
                    {Math.floor(xp)} / {Math.ceil(xpNeed)}
                </span>
            </div>

            <div className="resources">
                <span
                    className="resource shards"
                    title="Soul shards: earned on death and milestones. Spend them in the Souls tab."
                >
                    ✹ {shards}
                </span>
                <span className="resource gold" title="Gold: spend it in the Forge.">
                    ◈ {fn(gold)}
                </span>
                <span
                    className={`sync ${syncStatus}`}
                    title={
                        lastSavedAt
                            ? `Last saved ${new Date(lastSavedAt).toLocaleTimeString()}`
                            : "Not saved to the server yet"
                    }
                >
                    {syncStatus === "saved"
                        ? "Saved"
                        : syncStatus === "syncing"
                          ? "Saving…"
                          : syncStatus === "offline"
                            ? "Offline"
                            : syncStatus === "conflict"
                              ? "Synced"
                              : "Local"}
                </span>
                <Link
                    to="/account"
                    title={user?.displayName ?? "Account"}
                    className={`account-link${status === "offline" ? " offline" : ""}`}
                >
                    {label}
                </Link>
            </div>
        </header>
    );
}
