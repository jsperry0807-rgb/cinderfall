import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../stores/auth";

export function GuestBanner() {
    const status = useAuth((s) => s.status);
    const retry = useAuth((s) => s.retry);
    const [hidden, setHidden] = useState(false);

    if (hidden || status === "user" || status === "loading") return null;

    if (status === "offline") {
        return (
            <div className="banner warn">
                <span>API offline — playing locally.</span>
                <button className="link" onClick={() => void retry()}>
                    Retry
                </button>
                <button
                    className="dismiss"
                    aria-label="Dismiss"
                    onClick={() => setHidden(true)}
                >
                    ×
                </button>
            </div>
        );
    }

    return (
        <div className="banner">
            <span>
                    Playing as a guest — create an account to keep this save on
                    other devices.
                </span>
            <Link to="/signup">Create account</Link>
            <button
                className="dismiss"
                aria-label="Dismiss"
                onClick={() => setHidden(true)}
            >
                ×
            </button>
        </div>
    );
}
