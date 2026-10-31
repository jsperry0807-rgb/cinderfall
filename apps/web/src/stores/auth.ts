import { create } from "zustand";
import type {
    LoginInput,
    ResetPasswordInput,
    SignupInput,
} from "@cinderfall/contracts";
import { api, download } from "../net/api";
import { useGameStore } from "../game/store";

export interface PublicUser {
    id: string;
    email: string | null;
    displayName: string;
    isGuest: boolean;
    emailVerified: boolean;
    createdAt: string;
}

export interface SessionInfo {
    id: string;
    createdAt: string;
    lastUsedAt: string;
    expiresAt: string;
    ip: string | null;
    userAgent: string | null;
    current: boolean;
}

interface SessionResponse {
    user: PublicUser;
    csrf: string;
}

export type AuthStatus = "loading" | "guest" | "user" | "offline";

interface AuthStore {
    status: AuthStatus;
    user: PublicUser | null;
    csrf: string | null;
    sessions: SessionInfo[];
    error: string | null;
    bootstrapped: boolean;
    emailEnabled: boolean;

    bootstrap: () => Promise<void>;
    retry: () => Promise<void>;
    signup: (input: SignupInput) => Promise<void>;
    login: (input: LoginInput) => Promise<void>;
    logout: () => Promise<void>;
    updateProfile: (displayName: string) => Promise<void>;
    loadSessions: () => Promise<void>;
    revokeSession: (id: string) => Promise<void>;
    revokeOtherSessions: () => Promise<void>;
    exportAccount: () => Promise<void>;
    deleteAccount: (password?: string) => Promise<void>;

    requestPasswordReset: (email: string) => Promise<void>;
    resetPassword: (input: ResetPasswordInput) => Promise<void>;
    verifyEmail: (token: string) => Promise<{ email: string | null }>;
    resendVerification: () => Promise<void>;
}

export const useAuth = create<AuthStore>((set, get) => ({
    status: "loading",
    user: null,
    csrf: null,
    sessions: [],
    error: null,
    bootstrapped: false,
    emailEnabled: false,

    async bootstrap() {
        if (get().bootstrapped) return;
        set({ bootstrapped: true, error: null });

        try {
            const [session, config] = await Promise.all([
                api.get<SessionResponse | undefined>("/api/auth/session"),
                api
                    .get<{ emailEnabled: boolean }>("/api/config")
                    .catch(() => null),
            ]);
            const emailEnabled = config?.emailEnabled ?? false;

            if (session) {
                set({
                    status: session.user.isGuest ? "guest" : "user",
                    user: session.user,
                    csrf: session.csrf,
                    emailEnabled,
                });
                return;
            }

            const guest = await api.post<SessionResponse>("/api/auth/guest");
            set({
                status: "guest",
                user: guest.user,
                csrf: guest.csrf,
                emailEnabled,
            });
        } catch (err) {
            // Offline play is a supported state: the game runs locally.
            set({
                status: "offline",
                user: null,
                csrf: null,
                emailEnabled: false,
                error: err instanceof Error ? err.message : "API unavailable",
            });
        }
    },

    async retry() {
        set({ bootstrapped: false });
        await get().bootstrap();
    },

    async signup(input) {
        const session = await api.post<SessionResponse>(
            "/api/auth/signup",
            input,
        );
        // The guest run is kept: the server upgraded the same user row.
        set({
            status: "user",
            user: session.user,
            csrf: session.csrf,
            error: null,
        });
    },

    async login(input) {
        const session = await api.post<SessionResponse>(
            "/api/auth/login",
            input,
        );
        // Signing in discards the local guest run (the server purges it too).
        useGameStore.getState().reset();
        set({
            status: "user",
            user: session.user,
            csrf: session.csrf,
            error: null,
        });
    },

    async logout() {
        try {
            await api.post("/api/auth/logout", undefined, get().csrf);
        } catch {
            // Clearing the local view is still useful.
        }

        useGameStore.getState().reset();
        set({
            bootstrapped: false,
            user: null,
            csrf: null,
            sessions: [],
            status: "loading",
        });
        await get().bootstrap();
    },

    async updateProfile(displayName) {
        const csrf = get().csrf;
        const result = await api.patch<{ user: PublicUser }>(
            "/api/me",
            { displayName },
            csrf,
        );
        set({ user: result.user });
    },

    async loadSessions() {
        const result = await api.get<{ sessions: SessionInfo[] }>(
            "/api/me/sessions",
        );
        set({ sessions: result.sessions });
    },

    async revokeSession(id) {
        const session = get().sessions.find((s) => s.id === id);
        await api.del(`/api/me/sessions/${id}`, undefined, get().csrf);

        if (session?.current) {
            // The server cleared the cookie; start a fresh guest session.
            useGameStore.getState().reset();
            set({
                user: null,
                csrf: null,
                sessions: [],
                status: "loading",
                bootstrapped: false,
            });
            await get().bootstrap();
            return;
        }
        await get().loadSessions();
    },

    async revokeOtherSessions() {
        await api.post(
            "/api/me/sessions/revoke-others",
            undefined,
            get().csrf,
        );
        await get().loadSessions();
    },

    async exportAccount() {
        await download("/api/me/export");
    },

    async requestPasswordReset(email) {
        await api.post("/api/auth/password/request", { email });
    },

    async resetPassword(input) {
        await api.post("/api/auth/password/reset", input);
        // A reset signs every device out, including this one.
        set({
            status: "loading",
            user: null,
            csrf: null,
            sessions: [],
            bootstrapped: false,
        });
    },

    async verifyEmail(token) {
        const result = await api.post<{ email: string | null }>(
            "/api/auth/verify",
            { token },
        );
        const user = get().user;
        if (user) set({ user: { ...user, emailVerified: true } });
        return result;
    },

    async resendVerification() {
        await api.post(
            "/api/auth/verify/request",
            undefined,
            get().csrf,
        );
    },

    async deleteAccount(password) {
        await api.del(
            "/api/me",
            password === undefined ? {} : { password },
            get().csrf,
        );

        useGameStore.getState().reset();
        set({
            user: null,
            csrf: null,
            sessions: [],
            status: "loading",
            bootstrapped: false,
        });
        await get().bootstrap();
    },
}));
