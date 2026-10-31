// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SignupPage } from "../src/pages/SignupPage";
import { LoginPage } from "../src/pages/LoginPage";
import { AccountPage } from "../src/pages/AccountPage";
import { useAuth, type PublicUser } from "../src/stores/auth";

const guest: PublicUser = {
    id: "guest-1",
    email: null,
    displayName: "Wanderer-TEST",
    isGuest: true,
    emailVerified: false,
    createdAt: new Date().toISOString(),
};

const registered: PublicUser = {
    ...guest,
    id: "user-1",
    email: "ash@example.com",
    displayName: "Ash Walker",
    isGuest: false,
};

const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });

function setAuth(user: PublicUser | null, status: "guest" | "user" | "loading") {
    useAuth.setState({
        status,
        user,
        csrf: "csrf-token",
        sessions: [],
        error: null,
        bootstrapped: true,
    });
}

beforeEach(() => {
    setAuth(guest, "guest");
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("signup page", () => {
    it("validates fields before calling the API", async () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal("fetch", fetchSpy);

        const { container } = render(
            <MemoryRouter>
                <SignupPage />
            </MemoryRouter>,
        );

        const email = container.querySelector<HTMLInputElement>(
            'input[type="email"]',
        )!;
        const password = container.querySelector<HTMLInputElement>(
            'input[type="password"]',
        )!;

        fireEvent.change(email, { target: { value: "nope" } });
        fireEvent.change(password, { target: { value: "short" } });
        fireEvent.click(screen.getByRole("button", { name: /create account/i }));

        expect(screen.getByText("Enter a valid email")).toBeTruthy();
        expect(screen.getByText("Use at least 10 characters")).toBeTruthy();
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("creates the account and keeps the guest run", async () => {
        const fetchSpy = vi.fn(async () =>
            json({ user: registered, csrf: "new-csrf" }),
        );
        vi.stubGlobal("fetch", fetchSpy);

        const { container } = render(
            <MemoryRouter>
                <SignupPage />
            </MemoryRouter>,
        );

        const email = container.querySelector<HTMLInputElement>(
            'input[type="email"]',
        )!;
        const password = container.querySelector<HTMLInputElement>(
            'input[type="password"]',
        )!;

        fireEvent.change(email, { target: { value: "ash@example.com" } });
        fireEvent.change(password, {
            target: { value: "correct horse battery" },
        });
        fireEvent.click(screen.getByRole("button", { name: /create account/i }));

        await waitFor(() => {
            expect(useAuth.getState().status).toBe("user");
        });
        expect(useAuth.getState().user?.email).toBe("ash@example.com");
        expect(fetchSpy).toHaveBeenCalledWith(
            "/api/auth/signup",
            expect.objectContaining({ method: "POST" }),
        );
    });
});

describe("login page", () => {
    it("warns guests that signing in discards the run", () => {
        render(
            <MemoryRouter>
                <LoginPage />
            </MemoryRouter>,
        );
        expect(screen.getByText(/discards your guest run/i)).toBeTruthy();
        expect(screen.getByRole("link", { name: /create an account/i })).toBeTruthy();
    });

    it("shows the server error for bad credentials", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                json(
                    {
                        error: {
                            code: "invalid_credentials",
                            message: "Invalid email or password",
                        },
                    },
                    401,
                ),
            ),
        );

        const { container } = render(
            <MemoryRouter>
                <LoginPage />
            </MemoryRouter>,
        );

        fireEvent.change(
            container.querySelector<HTMLInputElement>('input[type="email"]')!,
            { target: { value: "ash@example.com" } },
        );
        fireEvent.change(
            container.querySelector<HTMLInputElement>(
                'input[type="password"]',
            )!,
            { target: { value: "wrong password" } },
        );
        fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

        await waitFor(() => {
            expect(
                screen.getByText("Invalid email or password"),
            ).toBeTruthy();
        });
    });
});

describe("account page", () => {
    it("shows the profile, sessions, export and danger zone", async () => {
        setAuth(registered, "user");
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                json({
                    sessions: [
                        {
                            id: "s1",
                            createdAt: new Date().toISOString(),
                            lastUsedAt: new Date().toISOString(),
                            expiresAt: new Date().toISOString(),
                            ip: "127.0.0.1",
                            userAgent: "test",
                            current: true,
                        },
                    ],
                }),
            ),
        );

        render(
            <MemoryRouter>
                <AccountPage />
            </MemoryRouter>,
        );

        await waitFor(() => {
            expect(screen.getByText("This device")).toBeTruthy();
        });

        expect(screen.getByText("Registered")).toBeTruthy();
        expect(screen.getByText("ash@example.com")).toBeTruthy();
        expect(screen.getByText("Export JSON")).toBeTruthy();
        expect(screen.getByText("Delete account")).toBeTruthy();
        expect(screen.getByText("Sign out")).toBeTruthy();
    });

    it("offers guests a path to claim the run", () => {
        render(
            <MemoryRouter>
                <AccountPage />
            </MemoryRouter>,
        );

        expect(screen.getByText("Guest")).toBeTruthy();
        expect(
            screen.getByRole("link", { name: /create an account/i }),
        ).toBeTruthy();
    });
});
