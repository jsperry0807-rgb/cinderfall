import { useState } from "react";
import { Link } from "react-router-dom";
import { emailRequestSchema } from "@cinderfall/contracts";
import { useAuth } from "../stores/auth";

export function ForgotPage() {
    const emailEnabled = useAuth((s) => s.emailEnabled);
    const requestReset = useAuth((s) => s.requestPasswordReset);

    const [email, setEmail] = useState("");
    const [sent, setSent] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    if (!emailEnabled) {
        return (
            <div className="page">
                <div className="panel auth">
                    <div className="page-head">
                        <h1>Reset password</h1>
                        <Link to="/login">← Back to sign in</Link>
                    </div>
                    <p className="warning">
                        Email delivery is not configured on this server, so
                        password reset is unavailable. You can still change
                        your password from the account page while signed in.
                    </p>
                </div>
            </div>
        );
    }

    const onSubmit = async (event: React.FormEvent): Promise<void> => {
        event.preventDefault();
        setError(null);

        const parsed = emailRequestSchema.safeParse({ email });
        if (!parsed.success) {
            setError(parsed.error.issues[0]?.message ?? "Enter a valid email");
            return;
        }

        setBusy(true);
        try {
            await requestReset(parsed.data.email);
            setSent(true);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Could not request a reset",
            );
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="page">
            <div className="panel auth">
                <div className="page-head">
                    <h1>Reset password</h1>
                    <Link to="/login">← Back to sign in</Link>
                </div>

                {sent ? (
                    <>
                        <p className="up">
                            If that email is registered, a reset link is on its
                            way.
                        </p>
                        <p className="mu">
                            The link expires in one hour. Check your spam folder
                            if it does not arrive.
                        </p>
                        <p className="switch">
                            <Link to="/login">Back to sign in</Link>
                        </p>
                    </>
                ) : (
                    <>
                        <p className="mu">
                            Enter the email on your account and we will send a
                            reset link.
                        </p>
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
                            <div className="form-actions">
                                <button
                                    className="btn"
                                    type="submit"
                                    disabled={busy}
                                >
                                    {busy ? "Sending…" : "Send reset link"}
                                </button>
                            </div>
                        </form>
                        {error && <p className="form-error">{error}</p>}
                    </>
                )}
            </div>
        </div>
    );
}
