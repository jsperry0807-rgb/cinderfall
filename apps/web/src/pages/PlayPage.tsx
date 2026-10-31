import { useEffect } from "react";
import { BossWarning } from "../components/BossWarning";
import { GuestBanner } from "../components/GuestBanner";
import { TopBar } from "../components/TopBar";
import { Toaster } from "../components/Toaster";
import { Arena } from "../components/arena/Arena";
import { HeroPanel } from "../components/hero/HeroPanel";
import { DeathModal } from "../components/modals/DeathModal";
import { SidePanel } from "../components/side/SidePanel";
import { useGameStore } from "../game/store";
import { OfflineModal } from "../components/modals/OfflineModal";
import { useSync } from "../stores/sync";
import { useAuth } from "../stores/auth";

export function PlayPage() {
    const snap = useGameStore((s) => s.snap);
    const start = useGameStore((s) => s.start);
    const stop = useGameStore((s) => s.stop);
    const authStatus = useAuth((s) => s.status);
    const syncStart = useSync((s) => s.start);
    const syncStop = useSync((s) => s.stop);

    useEffect(() => {
        start();
        return () => stop();
    }, [start, stop]);

    // Sync only once we have a guest/registered session.
    useEffect(() => {
        if (authStatus !== "guest" && authStatus !== "user") return;
        void syncStart();
        return () => syncStop();
    }, [authStatus, syncStart, syncStop]);

    // The simulation and sync pause while the tab is hidden; returning pulls
    // the server catch-up.
    useEffect(() => {
        const onVisibility = (): void => {
            if (document.hidden) {
                syncStop();
                stop();
            } else {
                start();
                void syncStart();
            }
        };
        const onPageHide = (): void => syncStop();
        document.addEventListener("visibilitychange", onVisibility);
        window.addEventListener("pagehide", onPageHide);
        return () => {
            document.removeEventListener("visibilitychange", onVisibility);
            window.removeEventListener("pagehide", onPageHide);
        };
    }, [start, stop, syncStart, syncStop]);

    if (!snap) {
        return <div className="boot">Lighting the forge…</div>;
    }

    return (
        <div className="app">
            <TopBar />
            <GuestBanner />
            <main className="layout">
                <HeroPanel />
                <Arena />
                <SidePanel />
            </main>
            <Toaster />
            <BossWarning />
            <DeathModal />
            <OfflineModal />
        </div>
    );
}
