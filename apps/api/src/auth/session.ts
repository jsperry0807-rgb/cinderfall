// Session tokens, cookies, sliding expiry and CSRF.
//
// The cookie holds a random token; only its SHA-256 is stored. Sessions are
// looked up by hash, expire after a sliding window, and are capped by an
// absolute lifetime.

import {
    createHash,
    createHmac,
    randomBytes,
    timingSafeEqual,
} from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Db } from "mongodb";
import type { Env } from "../env";
import { httpError } from "../lib/errors";
import { newId } from "../lib/ids";
import type { SessionDoc, UserDoc } from "../db/types";

const DAY_MS = 86_400_000;
const TOUCH_MS = 5 * 60_000;

export const hashToken = (token: string): Buffer =>
    createHash("sha256").update(token).digest();

export const csrfToken = (env: Env, sessionId: string): string =>
    createHmac("sha256", env.SESSION_SECRET)
        .update(`csrf:${sessionId}`)
        .digest("base64url");

export function assertCsrf(
    req: FastifyRequest,
    env: Env,
    session: SessionDoc,
): void {
    const got = req.headers["x-csrf-token"];
    if (typeof got !== "string") {
        throw httpError(403, "csrf_missing", "Missing CSRF token");
    }
    const expected = Buffer.from(csrfToken(env, session._id));
    const actual = Buffer.from(got);
    if (
        actual.length !== expected.length ||
        !timingSafeEqual(actual, expected)
    ) {
        throw httpError(403, "csrf_invalid", "Invalid CSRF token");
    }
}

export function setSessionCookie(
    reply: FastifyReply,
    env: Env,
    token: string,
    expiresAt: Date,
): void {
    const maxAge = Math.max(
        1,
        Math.floor((expiresAt.getTime() - Date.now()) / 1000),
    );
    reply.setCookie(env.cookieName, token, {
        path: "/",
        httpOnly: true,
        secure: env.cookieSecure,
        sameSite: "lax",
        maxAge,
    });
}

export function clearSessionCookie(reply: FastifyReply, env: Env): void {
    reply.clearCookie(env.cookieName, {
        path: "/",
        httpOnly: true,
        secure: env.cookieSecure,
        sameSite: "lax",
    });
}

export async function createSession(
    db: Db,
    env: Env,
    userId: string,
    req: FastifyRequest,
): Promise<{ token: string; session: SessionDoc }> {
    const token = randomBytes(32).toString("base64url");
    const now = new Date();
    const absoluteExpiresAt = new Date(
        now.getTime() + env.SESSION_ABSOLUTE_DAYS * DAY_MS,
    );
    const expiresAt = new Date(
        Math.min(
            now.getTime() + env.SESSION_TTL_DAYS * DAY_MS,
            absoluteExpiresAt.getTime(),
        ),
    );

    const session: SessionDoc = {
        _id: newId(),
        userId,
        tokenHash: hashToken(token),
        createdAt: now,
        lastUsedAt: now,
        expiresAt,
        absoluteExpiresAt,
        ip: req.ip ?? null,
        userAgent: req.headers["user-agent"] ?? null,
    };
    await db.collection<SessionDoc>("sessions").insertOne(session);
    return { token, session };
}

/**
 * Resolve the session cookie. Returns null (and clears the cookie) when the
 * token is unknown, expired, or points at a deleted user. Refreshes the sliding
 * window at most once per day, and `lastUsedAt` at most every five minutes.
 */
export async function readAuth(
    req: FastifyRequest,
    reply: FastifyReply,
    db: Db,
    env: Env,
): Promise<{ session: SessionDoc; user: UserDoc } | null> {
    const token = req.cookies?.[env.cookieName];
    if (!token) return null;

    const sessions = db.collection<SessionDoc>("sessions");
    const session = await sessions.findOne({ tokenHash: hashToken(token) });
    if (!session) {
        clearSessionCookie(reply, env);
        return null;
    }

    const now = Date.now();
    if (
        session.expiresAt.getTime() <= now ||
        session.absoluteExpiresAt.getTime() <= now
    ) {
        await sessions.deleteOne({ _id: session._id });
        clearSessionCookie(reply, env);
        return null;
    }

    const user = await db
        .collection<UserDoc>("users")
        .findOne({ _id: session.userId });
    if (!user) {
        await sessions.deleteOne({ _id: session._id });
        clearSessionCookie(reply, env);
        return null;
    }

    if (now - session.lastUsedAt.getTime() > DAY_MS) {
        const expiresAt = new Date(
            Math.min(
                now + env.SESSION_TTL_DAYS * DAY_MS,
                session.absoluteExpiresAt.getTime(),
            ),
        );
        await sessions.updateOne(
            { _id: session._id },
            { $set: { lastUsedAt: new Date(now), expiresAt } },
        );
        setSessionCookie(reply, env, token, expiresAt);
        session.lastUsedAt = new Date(now);
        session.expiresAt = expiresAt;
    } else if (now - session.lastUsedAt.getTime() > TOUCH_MS) {
        await sessions.updateOne(
            { _id: session._id },
            { $set: { lastUsedAt: new Date(now) } },
        );
    }

    return { session, user };
}
