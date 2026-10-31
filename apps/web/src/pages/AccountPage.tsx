import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { profileSchema } from "@cinderfall/contracts";
import { useGameStore } from "../game/store";
import { useAuth } from "../stores/auth";

const fmt = (iso: string): string => new Date(iso).toLocaleString();
const message = (err: unknown, fallback: string): string =>
    err instanceof Error ? err.message : fallback;

export function AccountPage() {
    const status = useAuth((s) => s.status);
    const user = useAuth((s) => s.user);
    const error = useAuth((s) => s.error);
    const sessions = useAuth((s) => s.sessions);
    const retry = useAuth((s) => s.retry);
    const logout = useAuth((s) => s.logout);
    const updateProfile = useAuth((s) => s.updateProfile);
    const loadSessions = useAuth((s) => s.loadSessions);
    const revokeSession = useAuth((s) => s.revokeSession);
    const revokeOtherSessions = useAuth((s) => s.revokeOtherSessions);
    const exportAccount = useAuth((s) => s.exportAccount);
    const deleteAccount = useAuth((s) => s.deleteAccount);
    const emailEnabled = useAuth((s) => s.emailEnabled);
    const resendVerification = useAuth((s) => s.resendVerification);
    const reset = useGameStore((s) => s.reset);
    const navigate = useNavigate();

    const [name, setName] = useState(user?.displayName ?? "");
    const [profileError, setProfileError] = useState<string | null>(null);
    const [profileSaved, setProfileSaved] = useState(false);
    const [busy, setBusy] = useState<"profile" | "export" | "delete" | null>(
        null,
    );
    const [dataError, setDataError] = useState<string | null>(null);
    const [deleteArmed, setDeleteArmed] = useState(false);
    const [deletePassword, setDeletePassword] = useState("");
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [resetArmed, setResetArmed] = useState(false);
    const [sendingVerify, setSendingVerify] = useState(false);
    const [verifyMessage, setVerifyMessage] = useState<string | null>(null);
    const [verifyError, setVerifyError] = useState<string | null>(null);

    useEffect(() => {
        if (user) setName(user.displayName);
    }, [user?.id]); // the name field is local while editing

    useEffect(() => {
        if (status !== "user" && status !== "guest") return;
        void loadSessions().catch(() => {
            // A 401 means the session expired; the next request reconnects.
        });
    }, [status, loadSessions]);

    const saveName = async (event: React.FormEvent): Promise<void> => {
        event.preventDefault();
        setProfileSaved(false);

        const parsed = profileSchema.safeParse({ displayName: name });
        if (!parsed.success) {
            setProfileError(
                parsed.error.issues[0]?.message ?? "Invalid display name",
            );
            return;
        }

        setProfileError(null);
        setBusy("profile");
        try {
            await updateProfile(parsed.data.displayName);
            setProfileSaved(true);
        } catch (err) {
            setProfileError(message(err, "Could not save the name"));
        } finally {
            setBusy(null);
        }
    };

    const onResendVerification = async (): Promise<void> => {
        setVerifyMessage(null);
        setVerifyError(null);
        setSendingVerify(true);
        try {
            await resendVerification();
            setVerifyMessage("Verification email sent.");
        } catch (err) {
            setVerifyError(
                message(err, "Could not send the verification email"),
            );
        } finally {
            setSendingVerify(false);
        }
    };

    const onExport = async (): Promise<void> => {
        setDataError(null);
        setBusy("export");
        try {
            await exportAccount();
        } catch (err) {
            setDataError(message(err, "Could not export the account"));
        } finally {
            setBusy(null);
        }
    };

    const onDelete = async (): Promise<void> => {
        if (!user) return;

        if (!deleteArmed) {
            if (!user.isGuest && !deletePassword) {
                setDeleteError("Enter your password to delete the account");
                return;
            }
            setDeleteError(null);
            setDeleteArmed(true);
            window.setTimeout(() => setDeleteArmed(false), 4_000);
            return;
        }

        setBusy("delete");
        try {
            await deleteAccount(user.isGuest ? undefined : deletePassword);
            navigate("/");
        } catch (err) {
            setDeleteError(message(err, "Could not delete the account"));
            setDeleteArmed(false);
        } finally {
            setBusy(null);
        }
    };

    const onReset = (): void => {
        if (!resetArmed) {
            setResetArmed(true);
            window.setTimeout(() => setResetArmed(false), 4_000);
            return;
        }
        setResetArmed(false);
        reset();
    };

    const signedIn = status === "guest" || status === "user";

    return (
        <div className="page">
            <div className="panel account">
                <div className="page-head">
                    <h1>Account</h1>
                    <Link to="/">← Back to the game</Link>
                </div>

                {status === "loading" && <p className="mu">Connecting…</p>}

                {status === "offline" && (
                    <div className="callout">
                        <p>
                            The API is unreachable, so you are playing locally.
                            {error ? <span className="mu"> ({error})</span> : null}
                        </p>
                        <button className="btn" onClick={() => void retry()}>
                            Retry connection
                        </button>
                    </div>
                )}

                {signedIn && user && (
                    <>
                        <section className="callout">
                            <h2>Profile</h2>
                            <form className="form" onSubmit={saveName} noValidate>
                                <label className="form-field">
                                    <span>Display name</span>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        aria-invalid={!!profileError}
                                    />
                                    {profileError && (
                                        <em className="field-error">
                                            {profileError}
                                        </em>
                                    )}
                                    {profileSaved && !profileError && (
                                        <em className="field-hint">Saved.</em>
                                    )}
                                </label>
                                <div className="form-actions">
                                    <button
                                        className="sm"
                                        type="submit"
                                        disabled={busy === "profile"}
                                    >
                                        {busy === "profile"
                                            ? "Saving…"
                                            : "Save name"}
                                    </button>
                                </div>
                            </form>

                            <dl className="kv">
                                <dt>Type</dt>
                                <dd>
                                    {user.isGuest ? (
                                        <span className="badge">Guest</span>
                                    ) : (
                                        <span className="badge">Registered</span>
                                    )}
                                </dd>
                                <dt>Email</dt>
                                <dd>
                                    {user.email ?? "—"}
                                    {user.email && !user.emailVerified ? (
                                        <span className="mu">
                                            {" "}
                                            · verification pending
                                        </span>
                                    ) : null}
                                </dd>
                                <dt>Player id</dt>
                                <dd className="mono">{user.id}</dd>
                                <dt>Created</dt>
                                <dd>{fmt(user.createdAt)}</dd>
                            </dl>

                            {user.email && !user.emailVerified && (
                                <div className="btns">
                                    {emailEnabled ? (
                                        <button
                                            className="sm"
                                            disabled={sendingVerify}
                                            onClick={() =>
                                                void onResendVerification()
                                            }
                                        >
                                            {sendingVerify
                                                ? "Sending…"
                                                : "Resend verification"}
                                        </button>
                                    ) : (
                                        <p className="mu">
                                            Email delivery is not configured;
                                            verification is unavailable.
                                        </p>
                                    )}
                                </div>
                            )}
                            {verifyMessage && (
                                <p className="field-hint">{verifyMessage}</p>
                            )}
                            {verifyError && (
                                <p className="form-error">{verifyError}</p>
                            )}

                            {user.isGuest && (
                                <p className="mu">
                                    <Link to="/signup">Create an account</Link>{" "}
                                    to keep this run and sign in elsewhere.
                                </p>
                            )}
                        </section>

                        <section className="callout">
                            <h2>Sessions</h2>
                            {sessions.length === 0 ? (
                                <p className="mu">Loading sessions…</p>
                            ) : (
                                <div className="session-list">
                                    {sessions.map((session) => (
                                        <div
                                            className="session-row"
                                            key={session.id}
                                        >
                                            <div>
                                                <b>
                                                    {session.current
                                                        ? "This device"
                                                        : "Other device"}
                                                </b>
                                                <div className="session-meta">
                                                    Created{" "}
                                                    {fmt(session.createdAt)} · Last
                                                    used {fmt(session.lastUsedAt)}
                                                    {session.ip
                                                        ? ` · ${session.ip}`
                                                        : ""}
                                                </div>
                                            </div>
                                            {!session.current && (
                                                <button
                                                    className="sm danger"
                                                    onClick={() =>
                                                        void revokeSession(
                                                            session.id,
                                                        )
                                                    }
                                                >
                                                    Revoke
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                            {sessions.length > 1 && (
                                <div className="btns">
                                    <button
                                        className="sm"
                                        onClick={() =>
                                            void revokeOtherSessions()
                                        }
                                    >
                                        Sign out other sessions
                                    </button>
                                </div>
                            )}
                        </section>

                        <section className="callout">
                            <h2>Your data</h2>
                            <p className="mu">
                                Download a JSON copy of your profile and save.
                            </p>
                            <div className="btns">
                                <button
                                    className="sm"
                                    disabled={busy === "export"}
                                    onClick={() => void onExport()}
                                >
                                    {busy === "export"
                                        ? "Preparing…"
                                        : "Export JSON"}
                                </button>
                            </div>
                            {dataError && (
                                <p className="form-error">{dataError}</p>
                            )}
                        </section>
                    </>
                )}

                {(status === "guest" || status === "user") && (
                    <section className="callout">
                        <h2>Local cache</h2>
                        <p className="mu">
                            The server owns your save. This browser keeps a
                            cached copy for fast starts and offline play.
                            Resetting wipes only this copy.
                        </p>
                        <div className="btns">
                            <button
                                className={`sm${resetArmed ? " danger" : ""}`}
                                onClick={onReset}
                            >
                                {resetArmed
                                    ? "Click again to wipe local progress"
                                    : "Reset local progress"}
                            </button>
                        </div>
                    </section>
                )}

                {user && (
                    <section className="callout danger-zone">
                        <h2>Danger zone</h2>
                        <p className="mu">
                            Deleting removes your account, save, sessions and
                            tokens. This cannot be undone.
                        </p>
                        {!user.isGuest && (
                            <label className="form-field">
                                <span>Password</span>
                                <input
                                    type="password"
                                    autoComplete="current-password"
                                    value={deletePassword}
                                    onChange={(e) =>
                                        setDeletePassword(e.target.value)
                                    }
                                />
                            </label>
                        )}
                        {deleteError && (
                            <p className="form-error">{deleteError}</p>
                        )}
                        <div className="btns">
                            <button
                                className={`btn${deleteArmed ? " danger" : ""}`}
                                disabled={busy === "delete"}
                                onClick={() => void onDelete()}
                            >
                                {busy === "delete"
                                    ? "Deleting…"
                                    : deleteArmed
                                      ? "Click again to permanently delete"
                                      : "Delete account"}
                            </button>
                        </div>
                    </section>
                )}

                <div className="btns">
                    {signedIn && (
                        <button className="btn" onClick={() => void logout()}>
                            Sign out
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
