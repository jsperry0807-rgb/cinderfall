import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../stores/auth";

type VerifyState = "working" | "ok" | "error";

export function VerifyPage() {
    const [params] = useSearchParams();
    const token = params.get("token") ?? "";
    const verifyEmail = useAuth((s) => s.verifyEmail);
    const currentEmail = useAuth((s) => s.user?.email);

    const [state, setState] = useState<VerifyState>(
        token ? "working" : "error",
    );
    const [message, setMessage] = useState(
        token ? "" : "This verification link is incomplete.",
    );
    const ran = useRef(false);

    useEffect(() => {
        if (ran.current) return;
        ran.current = true;
        if (!token) return;

        void verifyEmail(token)
            .then((result) => {
                setState("ok");
                setMessage(result.email ?? "");
            })
            .catch((err: unknown) => {
                setState("error");
                setMessage(
                    err instanceof Error
                        ? err.message
                        : "Could not verify this email",
                );
            });
    }, [token, verifyEmail]);

    return (
        <div className="page">
            <div className="panel auth">
                <div className="page-head">
                    <h1>Email verification</h1>
                    <Link to="/">Back to the game</Link>
                </div>

                {state === "working" && <p className="mu">Verifying…</p>}

                {state === "ok" && (
                    <>
                        <p className="up">
                            Email verified{message ? `: ${message}` : "."}
                        </p>
                        <p className="switch">
                            {message && currentEmail === message ? (
                                <Link to="/account">Go to your account</Link>
                            ) : (
                                <Link to="/login">
                                    Sign in to your account
                                </Link>
                            )}
                        </p>
                    </>
                )}

                {state === "error" && (
                    <>
                        <p className="form-error">{message}</p>
                        <p className="mu">
                            The link may have expired or already been used.
                            Sign in and resend it from your account.
                        </p>
                        <p className="switch">
                            <Link to="/account">Account</Link> ·{" "}
                            <Link to="/">Play</Link>
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}
