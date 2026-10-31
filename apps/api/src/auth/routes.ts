// Auth routes: guest sessions, signup/claim, login, session lookup, logout.

import { randomBytes } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import type { Db } from "mongodb";
import { createGame, hashSeed, mulberry32 } from "@cinderfall/sim";
import {
    emailRequestSchema,
    loginSchema,
    resetPasswordSchema,
    signupSchema,
    tokenSchema,
} from "@cinderfall/contracts";
import type { Env } from "../env";
import type { SaveDoc, SessionDoc, UserDoc } from "../db/types";
import { newId } from "../lib/ids";
import { httpError, toPublicUser } from "../lib/errors";
import { parseBody } from "../lib/validate";
import {
    dummyHash,
    hashPassword,
    isCommonPassword,
    verifyPassword,
} from "./password";
import { purgeUser } from "./service";
import type { Mailer } from "./mailer";
import {
    consumeToken,
    issueToken,
    RESET_TTL_MS,
    VERIFY_TTL_MS,
} from "./tokens";
import {
    assertCsrf,
    clearSessionCookie,
    createSession,
    csrfToken,
    readAuth,
    setSessionCookie,
} from "./session";

interface AuthRouteOptions {
    db: Db;
    env: Env;
    mailer: Mailer;
}

/** A playable starting save: full health and a real enemy. */
const freshSaveState = (userId: string) =>
    createGame(mulberry32(hashSeed(userId))).state;

const isDuplicateKey = (err: unknown): boolean =>
    typeof err === "object" &&
    err !== null &&
    (err as { code?: number }).code === 11000;

const authRoutes: FastifyPluginAsync<AuthRouteOptions> = async (app, opts) => {
    const { db, env, mailer } = opts;
    const users = db.collection<UserDoc>("users");
    const saves = db.collection<SaveDoc>("saves");
    const sessions = db.collection<SessionDoc>("sessions");

    async function sendVerification(user: UserDoc): Promise<void> {
        if (!user.email) return;
        const token = await issueToken(db, user._id, "verify", VERIFY_TTL_MS);
        const url = `${env.PUBLIC_ORIGIN}/verify?token=${encodeURIComponent(token)}`;
        await mailer.send({
            to: user.email,
            subject: "Verify your Cinderfall email",
            text:
                `Welcome to Cinderfall, ${user.displayName}.\n\n` +
                `Verify your email address:\n${url}\n\n` +
                `This link expires in 24 hours.\n` +
                `If you did not create an account, you can ignore this email.`,
        });
    }

    async function sendReset(user: UserDoc): Promise<void> {
        if (!user.email) return;
        const token = await issueToken(db, user._id, "reset", RESET_TTL_MS);
        const url = `${env.PUBLIC_ORIGIN}/reset?token=${encodeURIComponent(token)}`;
        await mailer.send({
            to: user.email,
            subject: "Reset your Cinderfall password",
            text:
                `Someone asked to reset the password for your Cinderfall account.\n\n` +
                `Choose a new password:\n${url}\n\n` +
                `This link expires in 1 hour. If this wasn't you, ignore this email; ` +
                `your password is unchanged.`,
        });
    }

    app.post(
        "/guest",
        {
            config: {
                rateLimit: {
                    max: env.GUEST_RATE_LIMIT,
                    timeWindow: "1 hour",
                },
            },
        },
        async (req, reply) => {
            const now = new Date();
            const suffix = randomBytes(2).toString("hex").toUpperCase();

            const user: UserDoc = {
                _id: newId(),
                email: null,
                emailLower: null,
                passwordHash: null,
                displayName: `Wanderer-${suffix}`,
                isGuest: true,
                emailVerifiedAt: null,
                createdAt: now,
                updatedAt: now,
                lastSeenAt: now,
            };

            await users.insertOne(user);
            try {
                await saves.insertOne({
                    _id: user._id,
                    schemaVersion: 1,
                    state: freshSaveState(user._id),
                    simClock: 0,
                    lastSimAt: now,
                    revision: 1,
                    updatedAt: now,
                });
            } catch (err) {
                await users.deleteOne({ _id: user._id });
                throw err;
            }

            const { token, session } = await createSession(
                db,
                env,
                user._id,
                req,
            );
            setSessionCookie(reply, env, token, session.expiresAt);

            return {
                user: toPublicUser(user),
                csrf: csrfToken(env, session._id),
            };
        },
    );

    app.post(
        "/signup",
        {
            config: {
                rateLimit: {
                    max: env.SIGNUP_RATE_LIMIT,
                    timeWindow: "1 hour",
                },
            },
        },
        async (req, reply) => {
            const input = parseBody(signupSchema, req.body);
            const email = input.email.trim();
            const emailLower = email.toLowerCase();
            const displayName = input.displayName.trim();

            if (isCommonPassword(input.password)) {
                throw httpError(
                    400,
                    "weak_password",
                    "Choose a less common password",
                );
            }

            const auth = await readAuth(req, reply, db, env);
            if (auth && !auth.user.isGuest) {
                throw httpError(
                    409,
                    "already_authenticated",
                    "You are already signed in",
                );
            }

            // Hash before the existence check so both paths take similar time.
            const passwordHash = await hashPassword(input.password);

            if (await users.findOne({ emailLower })) {
                throw httpError(
                    409,
                    "email_taken",
                    "That email is already registered",
                );
            }

            const now = new Date();
            let user: UserDoc;

            if (auth) {
                // Claim the guest: keep the user id and the existing save.
                const claimed = await users.findOneAndUpdate(
                    { _id: auth.user._id, isGuest: true },
                    {
                        $set: {
                            email,
                            emailLower,
                            passwordHash,
                            displayName,
                            isGuest: false,
                            emailVerifiedAt: null,
                            updatedAt: now,
                            lastSeenAt: now,
                        },
                    },
                    { returnDocument: "after" },
                );
                if (!claimed) {
                    throw httpError(
                        409,
                        "claim_failed",
                        "Could not claim this guest account",
                    );
                }
                user = claimed;
                await sessions.deleteOne({ _id: auth.session._id });
            } else {
                user = {
                    _id: newId(),
                    email,
                    emailLower,
                    passwordHash,
                    displayName,
                    isGuest: false,
                    emailVerifiedAt: null,
                    createdAt: now,
                    updatedAt: now,
                    lastSeenAt: now,
                };

                try {
                    await users.insertOne(user);
                    await saves.insertOne({
                        _id: user._id,
                        schemaVersion: 1,
                        state: freshSaveState(user._id),
                        simClock: 0,
                        lastSimAt: now,
                        revision: 1,
                        updatedAt: now,
                    });
                } catch (err) {
                    if (isDuplicateKey(err)) {
                        throw httpError(
                            409,
                            "email_taken",
                            "That email is already registered",
                        );
                    }
                    throw err;
                }
            }

            try {
                await sendVerification(user);
            } catch (err) {
                req.log.warn({ err }, "verification email failed");
            }

            const { token, session } = await createSession(
                db,
                env,
                user._id,
                req,
            );
            setSessionCookie(reply, env, token, session.expiresAt);

            return {
                user: toPublicUser(user),
                csrf: csrfToken(env, session._id),
            };
        },
    );

    app.post(
        "/login",
        {
            config: {
                rateLimit: {
                    max: env.LOGIN_RATE_LIMIT,
                    timeWindow: "1 minute",
                },
            },
        },
        async (req, reply) => {
            const input = parseBody(loginSchema, req.body);
            const emailLower = input.email.trim().toLowerCase();

            const user = await users.findOne({ emailLower });

            if (!user || !user.passwordHash) {
                // Equalise timing with the real verification path.
                await verifyPassword(await dummyHash(), input.password);
                throw httpError(
                    401,
                    "invalid_credentials",
                    "Invalid email or password",
                );
            }

            const ok = await verifyPassword(user.passwordHash, input.password);
            if (!ok) {
                throw httpError(
                    401,
                    "invalid_credentials",
                    "Invalid email or password",
                );
            }

            // Signing in from a guest session discards that guest (the client
            // warns first; signup is the path that keeps the run).
            const auth = await readAuth(req, reply, db, env);
            if (auth) {
                if (auth.user.isGuest && auth.user._id !== user._id) {
                    await purgeUser(db, auth.user._id);
                } else {
                    await sessions.deleteOne({ _id: auth.session._id });
                }
            }

            const now = new Date();
            await users.updateOne(
                { _id: user._id },
                { $set: { lastSeenAt: now } },
            );

            const { token, session } = await createSession(
                db,
                env,
                user._id,
                req,
            );
            setSessionCookie(reply, env, token, session.expiresAt);

            return {
                user: toPublicUser(user),
                csrf: csrfToken(env, session._id),
            };
        },
    );

    app.post(
        "/verify",
        {
            config: {
                rateLimit: { max: 20, timeWindow: "1 hour" },
            },
        },
        async (req) => {
            const input = parseBody(tokenSchema, req.body);
            const token = await consumeToken(db, input.token, "verify");
            if (!token) {
                throw httpError(
                    400,
                    "invalid_token",
                    "This verification link is invalid or has expired",
                );
            }

            const user = await users.findOne({ _id: token.userId });
            if (!user) {
                throw httpError(
                    400,
                    "invalid_token",
                    "This verification link is invalid or has expired",
                );
            }

            const now = new Date();
            await users.updateOne(
                { _id: user._id },
                { $set: { emailVerifiedAt: now, updatedAt: now } },
            );

            return { ok: true, email: user.email };
        },
    );

    app.post(
        "/verify/request",
        {
            config: {
                rateLimit: { max: 5, timeWindow: "1 hour" },
            },
        },
        async (req, reply) => {
            const auth = await readAuth(req, reply, db, env);
            if (!auth) {
                throw httpError(401, "unauthenticated", "Sign in first");
            }
            assertCsrf(req, env, auth.session);

            if (auth.user.emailVerifiedAt) {
                throw httpError(
                    400,
                    "already_verified",
                    "This email is already verified",
                );
            }
            if (!auth.user.email) {
                throw httpError(400, "no_email", "Add an email first");
            }

            try {
                await sendVerification(auth.user);
            } catch (err) {
                req.log.warn({ err }, "verification email failed");
                throw httpError(
                    503,
                    "email_failed",
                    "Could not send the verification email",
                );
            }
            return { ok: true };
        },
    );

    app.post(
        "/password/request",
        {
            config: {
                rateLimit: { max: 5, timeWindow: "1 hour" },
            },
        },
        async (req) => {
            const input = parseBody(emailRequestSchema, req.body);

            // Always answer the same way; never reveal whether the account
            // exists.
            const user = await users.findOne({
                emailLower: input.email.trim().toLowerCase(),
            });
            if (user?.passwordHash) {
                try {
                    await sendReset(user);
                } catch (err) {
                    req.log.warn({ err }, "password reset email failed");
                }
            }

            return { ok: true };
        },
    );

    app.post(
        "/password/reset",
        {
            config: {
                rateLimit: { max: 10, timeWindow: "1 hour" },
            },
        },
        async (req) => {
            const input = parseBody(resetPasswordSchema, req.body);

            if (isCommonPassword(input.password)) {
                throw httpError(
                    400,
                    "weak_password",
                    "Choose a less common password",
                );
            }

            const token = await consumeToken(db, input.token, "reset");
            if (!token) {
                throw httpError(
                    400,
                    "invalid_token",
                    "This reset link is invalid or has expired",
                );
            }

            const user = await users.findOne({ _id: token.userId });
            if (!user) {
                throw httpError(
                    400,
                    "invalid_token",
                    "This reset link is invalid or has expired",
                );
            }

            const passwordHash = await hashPassword(input.password);
            const now = new Date();

            await users.updateOne(
                { _id: user._id },
                { $set: { passwordHash, updatedAt: now } },
            );
            // A reset signs every device out.
            await sessions.deleteMany({ userId: user._id });

            return { ok: true };
        },
    );

    app.get("/session", async (req, reply) => {
        const auth = await readAuth(req, reply, db, env);
        if (!auth) return reply.code(204).send();

        if (Date.now() - auth.user.lastSeenAt.getTime() > 60_000) {
            const now = new Date();
            await users.updateOne(
                { _id: auth.user._id },
                { $set: { lastSeenAt: now } },
            );
            auth.user.lastSeenAt = now;
        }

        return {
            user: toPublicUser(auth.user),
            csrf: csrfToken(env, auth.session._id),
        };
    });

    app.post("/logout", async (req, reply) => {
        const auth = await readAuth(req, reply, db, env);
        if (auth) {
            assertCsrf(req, env, auth.session);
            await sessions.deleteOne({ _id: auth.session._id });
        }
        clearSessionCookie(reply, env);
        return { ok: true };
    });
};

export default authRoutes;
