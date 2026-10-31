import { useEffect } from "react";
import { useGameStore, type Toast } from "../game/store";

function ToastItem({ toast }: { toast: Toast }) {
    const dismiss = useGameStore((s) => s.dismissToast);

    useEffect(() => {
        const timer = window.setTimeout(() => dismiss(toast.id), 3_200);
        return () => window.clearTimeout(timer);
    }, [toast.id, dismiss]);

    return <div className={`toast ${toast.kind}`}>{toast.text}</div>;
}

export function Toaster() {
    const toasts = useGameStore((s) => s.toasts);
    return (
        <div className="toasts" aria-live="polite">
            {toasts.map((t) => (
                <ToastItem key={t.id} toast={t} />
            ))}
        </div>
    );
}
