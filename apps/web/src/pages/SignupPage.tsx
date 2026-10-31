import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { signupSchema } from "@cinderfall/contracts";
import { useAuth } from "../stores/auth";

function fieldProblems(
    issues: Array<{ path: PropertyKey[]; message: string }>,
): Record<string, string> {
    const out: Record<string, string> = {};
    for (const issue of issues) {
        const key = String(issue.path[0] ?? "form");
        out[key] ??= issue.message;
    }
    return out;
}

export function SignupPage() {
    const status = useAuth((s) => s.status);
    const user = useAuth((s) => s.user);
    const signup = useAuth((s) => s.signup);
    const navigate = useNavigate();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [displayName, setDisplayName] = useState(
        user?.isGuest ? user.displayName : "",
    );
    const [issues, setIssues] = useState<Record<string, string>>({});
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    // The guest name arrives asynchronously; prefill it once it does.
    useEffect(() => {
        if (!user?.isGuest) return;
        setDisplayName((current) => current || user.displayName);
    }, [user?.isGuest, user?.displayName]);

    if (status === "user") return <Navigate to="/" replace />;

    const onSubmit = async (event: React.FormEvent): Promise<void> => {
        event.preventDefault();
        setError(null);

        const parsed = signupSchema.safeParse({ email, password, displayName });
        if (!parsed.success) {
            setIssues(fieldProblems(parsed.error.issues));
            return;
        }

        setIssues({});
        setBusy(true);
        try {
            await signup(parsed.data);
            navigate("/");
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Could not create the account",
            );
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="page">
            <div className="panel auth">
                <div className="page-head">
                    <h1>Create account</h1>
                    <Link to="/">← Back to the game</Link>
                </div>

                {status === "guest" && (
                    <p className="warning">
                        Your current guest run is kept. This account will own it.
                    </p>
                )}
                {status === "offline" && (
                    <p className="warning">
                        The API is unreachable. Account creation needs a
                        connection — you can keep playing locally.
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
                            aria-invalid={!!issues.email}
                        />
                        {issues.email && (
                            <em className="field-error">{issues.email}</em>
                        )}
                    </label>

                    <label className="form-field">
                        <span>Password</span>
                        <input
                            type="password"
                            autoComplete="new-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            aria-invalid={!!issues.password}
                        />
                        {issues.password ? (
                            <em className="field-error">{issues.password}</em>
                        ) : (
                            <em className="field-hint">At least 10 characters.</em>
                        )}
                    </label>

                    <label className="form-field">
                        <span>Display name</span>
                        <input
                            type="text"
                            autoComplete="nickname"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            aria-invalid={!!issues.displayName}
                        />
                        {issues.displayName && (
                            <em className="field-error">
                                {issues.displayName}
                            </em>
                        )}
                    </label>

                    <div className="form-actions">
                        <button className="btn" type="submit" disabled={busy}>
                            {busy ? "Creating…" : "Create account"}
                        </button>
                    </div>
                </form>

                {error && <p className="form-error">{error}</p>}

                <p className="switch">
                    Already have an account?{" "}
                    <Link to="/login">Sign in</Link>
                </p>
            </div>
        </div>
    );
}
