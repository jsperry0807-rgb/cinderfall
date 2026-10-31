import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import type { FastifyInstance } from "fastify";
import type { Db, MongoClient } from "mongodb";
import { buildServer } from "../src/server";
import { connectMongo } from "../src/db/mongo";
import { ensureIndexes } from "../src/db/indexes";
import { loadEnv, testEnv, type Env } from "../src/env";
import type { UserDoc } from "../src/db/types";

let mongo: MongoMemoryServer;
let client: MongoClient;
let counter = 0;

beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    const conn = await connectMongo(mongo.getUri(), "cinderfall_email");
    client = conn.client;
}, 120_000);

afterAll(async () => {
    await client?.close();
    await mongo?.stop();
});

async function freshDb(): Promise<Db> {
    const db = client.db(`email_${++counter}`);
    await ensureIndexes(db);
    return db;
}

async function makeApp(
    overrides: Record<string, string> = {},
): Promise<{ app: FastifyInstance; env: Env; db: Db }> {
    const db = await freshDb();
    const env = testEnv({
        GUEST_RATE_LIMIT: "100",
        SIGNUP_RATE_LIMIT: "100",
        LOGIN_RATE_LIMIT: "100",
        ...overrides,
    });
    const app = await buildServer({ env, db });
    await app.ready();
    return { app, env, db };
}

const headers = (env: Env, cookie?: string, csrf?: string) => ({
    origin: env.PUBLIC_ORIGIN,
    ...(cookie ? { cookie } : {}),
    ...(csrf ? { "x-csrf-token": csrf } : {}),
});

function cookieOf(res: { headers: Record<string, unknown> }, env: Env): string {
    const raw = res.headers["set-cookie"];
    const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
    const found = list.find((c) => c.startsWith(`${env.cookieName}=`));
    expect(found).toBeTruthy();
    return found!.split(";")[0]!;
}

const VALID = {
    email: "mail@example.com",
    password: "correct horse battery",
    displayName: "Mail Tester",
};

async function signup(app: FastifyInstance, env: Env) {
    const res = await app.inject({
        method: "POST",
        url: "/api/auth/signup",
        headers: headers(env),
        payload: VALID,
    });
    expect(res.statusCode).toBe(200);
    return {
        id: res.json().user.id as string,
        csrf: res.json().csrf as string,
        cookie: cookieOf(res, env),
    };
}

interface Message {
    to: string;
    subject: string;
    text: string;
    at: string;
}

async function inbox(app: FastifyInstance): Promise<Message[]> {
    const res = await app.inject({ method: "GET", url: "/api/dev/mail" });
    expect(res.statusCode).toBe(200);
    return res.json().messages as Message[];
}

function tokenFrom(text: string, kind: "verify" | "reset"): string {
    const match = new RegExp(`/${kind}\\?token=([A-Za-z0-9_-]+)`).exec(text);
    expect(match, `${kind} link in email`).toBeTruthy();
    return match![1]!;
}

describe("email verification", () => {
    it("mails a link on signup that verifies the address once", async () => {
        const { app, env, db } = await makeApp();
        const user = await signup(app, env);

        const messages = await inbox(app);
        expect(messages).toHaveLength(1);
        expect(messages[0]!.to).toBe(VALID.email);
        expect(messages[0]!.subject).toMatch(/verify/i);

        const token = tokenFrom(messages[0]!.text, "verify");
        const verify = await app.inject({
            method: "POST",
            url: "/api/auth/verify",
            headers: headers(env),
            payload: { token },
        });
        expect(verify.statusCode).toBe(200);
        expect(verify.json().email).toBe(VALID.email);

        const doc = await db
            .collection<UserDoc>("users")
            .findOne({ _id: user.id });
        expect(doc?.emailVerifiedAt).toBeInstanceOf(Date);

        const again = await app.inject({
            method: "POST",
            url: "/api/auth/verify",
            headers: headers(env),
            payload: { token },
        });
        expect(again.statusCode).toBe(400);
        expect(again.json().error.code).toBe("invalid_token");

        await app.close();
    });

    it("resends a verification link and invalidates the previous one", async () => {
        const { app, env } = await makeApp();
        const user = await signup(app, env);
        const first = tokenFrom((await inbox(app))[0]!.text, "verify");

        const noCsrf = await app.inject({
            method: "POST",
            url: "/api/auth/verify/request",
            headers: headers(env, user.cookie),
        });
        expect(noCsrf.statusCode).toBe(403);

        const resend = await app.inject({
            method: "POST",
            url: "/api/auth/verify/request",
            headers: headers(env, user.cookie, user.csrf),
        });
        expect(resend.statusCode).toBe(200);

        const messages = await inbox(app);
        expect(messages).toHaveLength(2);
        const second = tokenFrom(messages[1]!.text, "verify");
        expect(second).not.toBe(first);

        const stale = await app.inject({
            method: "POST",
            url: "/api/auth/verify",
            headers: headers(env),
            payload: { token: first },
        });
        expect(stale.statusCode).toBe(400);

        const ok = await app.inject({
            method: "POST",
            url: "/api/auth/verify",
            headers: headers(env),
            payload: { token: second },
        });
        expect(ok.statusCode).toBe(200);

        const already = await app.inject({
            method: "POST",
            url: "/api/auth/verify/request",
            headers: headers(env, user.cookie, user.csrf),
        });
        expect(already.statusCode).toBe(400);
        expect(already.json().error.code).toBe("already_verified");

        await app.close();
    });
});

describe("password reset", () => {
    it("resets the password, revokes sessions and is single-use", async () => {
        const { app, env } = await makeApp();
        const user = await signup(app, env);

        await app.inject({
            method: "POST",
            url: "/api/auth/password/request",
            headers: headers(env),
            payload: { email: VALID.email },
        });

        const messages = await inbox(app);
        const resetMessage = messages.find((m) => /reset/i.test(m.subject));
        expect(resetMessage).toBeTruthy();
        const token = tokenFrom(resetMessage!.text, "reset");

        const reset = await app.inject({
            method: "POST",
            url: "/api/auth/password/reset",
            headers: headers(env),
            payload: { token, password: "a brand new password" },
        });
        expect(reset.statusCode).toBe(200);

        const oldLogin = await app.inject({
            method: "POST",
            url: "/api/auth/login",
            headers: headers(env),
            payload: { email: VALID.email, password: VALID.password },
        });
        expect(oldLogin.statusCode).toBe(401);

        const newLogin = await app.inject({
            method: "POST",
            url: "/api/auth/login",
            headers: headers(env),
            payload: { email: VALID.email, password: "a brand new password" },
        });
        expect(newLogin.statusCode).toBe(200);

        // The session from before the reset is gone.
        const oldSession = await app.inject({
            method: "GET",
            url: "/api/auth/session",
            headers: { cookie: user.cookie },
        });
        expect(oldSession.statusCode).toBe(204);

        const reuse = await app.inject({
            method: "POST",
            url: "/api/auth/password/reset",
            headers: headers(env),
            payload: { token, password: "another password" },
        });
        expect(reuse.statusCode).toBe(400);

        await app.close();
    });

    it("does not reveal whether an email exists", async () => {
        const { app, env } = await makeApp();
        await signup(app, env);
        const before = (await inbox(app)).length;

        const unknown = await app.inject({
            method: "POST",
            url: "/api/auth/password/request",
            headers: headers(env),
            payload: { email: "nobody@example.com" },
        });
        expect(unknown.statusCode).toBe(200);
        expect(unknown.json()).toEqual({ ok: true });
        expect((await inbox(app)).length).toBe(before);

        await app.close();
    });

    it("rejects invalid tokens and weak passwords", async () => {
        const { app, env } = await makeApp();

        const bad = await app.inject({
            method: "POST",
            url: "/api/auth/password/reset",
            headers: headers(env),
            payload: { token: "x".repeat(40), password: "a good password" },
        });
        expect(bad.statusCode).toBe(400);
        expect(bad.json().error.code).toBe("invalid_token");

        await app.inject({
            method: "POST",
            url: "/api/auth/password/request",
            headers: headers(env),
            payload: { email: VALID.email },
        });

        // No account exists yet, so no message; use a fresh signup.
        await signup(app, env);
        await app.inject({
            method: "POST",
            url: "/api/auth/password/request",
            headers: headers(env),
            payload: { email: VALID.email },
        });
        const messages = await inbox(app);
        const resetMessage = messages
            .filter((m) => /reset/i.test(m.subject))
            .at(-1)!;
        const token = tokenFrom(resetMessage.text, "reset");

        const weak = await app.inject({
            method: "POST",
            url: "/api/auth/password/reset",
            headers: headers(env),
            payload: { token, password: "password123" },
        });
        expect(weak.statusCode).toBe(400);
        expect(weak.json().error.code).toBe("weak_password");

        await app.close();
    });
});

describe("email configuration", () => {
    it("advertises email in development and exposes the dev inbox", async () => {
        const { app } = await makeApp();
        const config = await app.inject({ method: "GET", url: "/api/config" });
        expect(config.statusCode).toBe(200);
        expect(config.json()).toEqual({ emailEnabled: true });

        const inboxRes = await app.inject({
            method: "GET",
            url: "/api/dev/mail",
        });
        expect(inboxRes.statusCode).toBe(200);
        expect(inboxRes.json().messages).toEqual([]);

        await app.close();
    });

    it("hides email and the dev inbox in production with the console mailer", async () => {
        const db = await freshDb();
        const env = loadEnv({
            NODE_ENV: "production",
            SESSION_SECRET: "x".repeat(48),
            PUBLIC_ORIGIN: "https://cinderfall.example",
            MONGODB_URI: "mongodb://127.0.0.1:27017/cinderfall",
            MAILER: "console",
        });
        const app = await buildServer({ env, db });
        await app.ready();

        const config = await app.inject({ method: "GET", url: "/api/config" });
        expect(config.json()).toEqual({ emailEnabled: false });

        const inboxRes = await app.inject({
            method: "GET",
            url: "/api/dev/mail",
        });
        expect(inboxRes.statusCode).toBe(404);

        await app.close();
    });
});
