import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { resetPasswordSchema } from "@cinderfall/contracts";
import { useAuth } from "../stores/auth";

export function ResetPage() {
    const [params] = useSearchParams();
    const token = params.get("token") ?? "";
    const resetPassword = useAuth((s) => s.resetPassword);

    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [done, setDone] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    if (!token) {
        return (
            <div className="page">
                <div className="panel auth">
                    <div className="page-head">
                        <h1>Reset password</h1>
                        <Link to="/forgot">Request a new link</Link>
                    </div>
                    <p className="warning">
                        This reset link is incomplete. Request a new one.
                    </p>
                </div>
            </div>
        );
    }

    if (done) {
        return (
            <div className="page">
                <div className="panel auth">
                    <div className="page-head">
                        <h1>Password updated</h1>
                        <Link to="/login">Sign in</Link>
                    </div>
                    <p className="up">
                        Your password has been changed. All devices have been
                        signed out.
                    </p>
                    <p className="switch">
                        <Link to="/login">Sign in with the new password</Link>
                    </p>
                </div>
            </div>
        );
    }

    const onSubmit = async (event: React.FormEvent): Promise<void> => {
        event.preventDefault();
        setError(null);

        const parsed = resetPasswordSchema.safeParse({ token, password });
        if (!parsed.success) {
            setError(parsed.error.issues[0]?.message ?? "Invalid password");
            return;
        }
        if (password !== confirm) {
            setError("Passwords do not match");
            return;
        }

        setBusy(true);
        try {
            await resetPassword(parsed.data);
            setDone(true);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Could not reset the password",
            );
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="page">
            <div className="panel auth">
                <div className="page-head">
                    <h1>New password</h1>
                    <Link to="/forgot">Request a new link</Link>
                </div>

                <form className="form" onSubmit={onSubmit} noValidate>
                    <label className="form-field">
                        <span>New password</span>
                        <input
                            type="password"
                            autoComplete="new-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                        <em className="field-hint">At least 10 characters.</em>
                    </label>

                    <label className="form-field">
                        <span>Confirm password</span>
                        <input
                            type="password"
                            autoComplete="new-password"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                        />
                    </label>

                    <div className="form-actions">
                        <button className="btn" type="submit" disabled={busy}>
                            {busy ? "Saving…" : "Set new password"}
                        </button>
                    </div>
                </form>

                {error && <p className="form-error">{error}</p>}
            </div>
        </div>
    );
}
