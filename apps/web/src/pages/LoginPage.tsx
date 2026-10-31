import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { loginSchema } from "@cinderfall/contracts";
import { useAuth } from "../stores/auth";

export function LoginPage() {
    const status = useAuth((s) => s.status);
    const emailEnabled = useAuth((s) => s.emailEnabled);
    const login = useAuth((s) => s.login);
    const navigate = useNavigate();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    if (status === "user") return <Navigate to="/" replace />;

    const onSubmit = async (event: React.FormEvent): Promise<void> => {
        event.preventDefault();
        setError(null);

        const parsed = loginSchema.safeParse({ email, password });
        if (!parsed.success) {
            setError(parsed.error.issues[0]?.message ?? "Invalid input");
            return;
        }

        setBusy(true);
        try {
            await login(parsed.data);
            navigate("/");
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Could not sign in",
            );
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="page">
            <div className="panel auth">
                <div className="page-head">
                    <h1>Sign in</h1>
                    <Link to="/">← Back to the game</Link>
                </div>

                {status === "guest" && (
                    <p className="warning">
                        Signing in discards your guest run.{" "}
                        <Link to="/signup">Create an account</Link> instead to
                        keep it.
                    </p>
                )}

                <form className="form" onSubmit={onSubmit} noValidate>
                    <label className="form-field">
                        <span>Email</span>
                        <input
                            type="email"
                            autoComplete="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </label>

                    <label className="form-field">
                        <span>Password</span>
                        <input
                            type="password"
                            autoComplete="current-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </label>

                    <div className="form-actions">
                        <button className="btn" type="submit" disabled={busy}>
                            {busy ? "Signing in…" : "Sign in"}
                        </button>
                        {emailEnabled && (
                            <Link className="sm-link" to="/forgot">
                                Forgot password?
                            </Link>
                        )}
                    </div>
                </form>

                {error && <p className="form-error">{error}</p>}

                <p className="switch">
                    Need an account? <Link to="/signup">Create one</Link>
                </p>
            </div>
        </div>
    );
}
