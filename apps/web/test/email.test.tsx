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
import { ForgotPage } from "../src/pages/ForgotPage";
import { ResetPage } from "../src/pages/ResetPage";
import { VerifyPage } from "../src/pages/VerifyPage";
import { AccountPage } from "../src/pages/AccountPage";
import { useAuth, type PublicUser } from "../src/stores/auth";

const token = "t".repeat(40);

const registered: PublicUser = {
    id: "user-email",
    email: "ash@example.com",
    displayName: "Ash Walker",
    isGuest: false,
    emailVerified: false,
    createdAt: new Date().toISOString(),
};

const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });

beforeEach(() => {
    useAuth.setState({
        status: "user",
        user: registered,
        csrf: "csrf",
        sessions: [],
        error: null,
        bootstrapped: true,
        emailEnabled: true,
    });
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("forgot password", () => {
    it("sends a reset request and shows the generic message", async () => {
        const fetchSpy = vi.fn(async () => json({ ok: true }));
        vi.stubGlobal("fetch", fetchSpy);

        render(
            <MemoryRouter>
                <ForgotPage />
            </MemoryRouter>,
        );

        fireEvent.change(
            screen.getByRole("textbox", { name: /email/i }),
            { target: { value: "ash@example.com" } },
        );
        fireEvent.click(
            screen.getByRole("button", { name: /send reset link/i }),
        );

        await waitFor(() => {
            expect(
                screen.getByText(/If that email is registered/i),
            ).toBeTruthy();
        });
        expect(fetchSpy).toHaveBeenCalledWith(
            "/api/auth/password/request",
            expect.objectContaining({ method: "POST" }),
        );
    });

    it("explains when email delivery is disabled", () => {
        useAuth.setState({ emailEnabled: false });
        render(
            <MemoryRouter>
                <ForgotPage />
            </MemoryRouter>,
        );
        expect(
            screen.getByText(/Email delivery is not configured/i),
        ).toBeTruthy();
    });
});

describe("reset password", () => {
    function renderReset() {
        return render(
            <MemoryRouter initialEntries={[`/reset?token=${token}`]}>
                <ResetPage />
            </MemoryRouter>,
        );
    }

    it("requires matching passwords", () => {
        renderReset();

        const [password, confirm] = screen.getAllByLabelText(/password/i);
        fireEvent.change(password!, { target: { value: "a good password" } });
        fireEvent.change(confirm!, { target: { value: "different password" } });
        fireEvent.click(screen.getByRole("button", { name: /set new password/i }));

        expect(screen.getByText("Passwords do not match")).toBeTruthy();
    });

    it("submits the token and new password", async () => {
        const fetchSpy = vi.fn(async () => json({ ok: true }));
        vi.stubGlobal("fetch", fetchSpy);
        renderReset();

        const [password, confirm] = screen.getAllByLabelText(/password/i);
        fireEvent.change(password!, { target: { value: "a brand new password" } });
        fireEvent.change(confirm!, { target: { value: "a brand new password" } });
        fireEvent.click(screen.getByRole("button", { name: /set new password/i }));

        await waitFor(() => {
            expect(screen.getByText("Password updated")).toBeTruthy();
        });
        expect(fetchSpy).toHaveBeenCalledWith(
            "/api/auth/password/reset",
            expect.objectContaining({ method: "POST" }),
        );
    });
});

describe("verify email", () => {
    it("verifies the token and reports success", async () => {
        const fetchSpy = vi.fn(async () =>
            json({ ok: true, email: "ash@example.com" }),
        );
        vi.stubGlobal("fetch", fetchSpy);

        render(
            <MemoryRouter initialEntries={[`/verify?token=${token}`]}>
                <VerifyPage />
            </MemoryRouter>,
        );

        await waitFor(() => {
            expect(
                screen.getByText(/Email verified: ash@example.com/),
            ).toBeTruthy();
        });
        expect(useAuth.getState().user?.emailVerified).toBe(true);
    });

    it("reports an invalid link", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                json(
                    {
                        error: {
                            code: "invalid_token",
                            message: "This verification link is invalid or has expired",
                        },
                    },
                    400,
                ),
            ),
        );

        render(
            <MemoryRouter initialEntries={[`/verify?token=${token}`]}>
                <VerifyPage />
            </MemoryRouter>,
        );

        await waitFor(() => {
            expect(
                screen.getByText(/invalid or has expired/i),
            ).toBeTruthy();
        });
    });
});

describe("account verification", () => {
    it("offers to resend verification for an unverified email", async () => {
        const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes("/api/me/sessions")) return json({ sessions: [] });
            return json({ ok: true });
        });
        vi.stubGlobal("fetch", fetchSpy);

        render(
            <MemoryRouter>
                <AccountPage />
            </MemoryRouter>,
        );

        fireEvent.click(
            screen.getByRole("button", { name: /resend verification/i }),
        );

        await waitFor(() => {
            expect(
                screen.getByText("Verification email sent."),
            ).toBeTruthy();
        });
        expect(fetchSpy).toHaveBeenCalledWith(
            "/api/auth/verify/request",
            expect.objectContaining({ method: "POST" }),
        );
    });
});
