// Account routes: profile, export, deletion and session management.

import type { FastifyPluginAsync } from "fastify";
import type { Db } from "mongodb";
import { deleteAccountSchema, profileSchema } from "@cinderfall/contracts";
import type { Env } from "../env";
import type { SaveDoc, SessionDoc, UserDoc } from "../db/types";
import { authOf, requireAuth } from "../auth/guards";
import { assertCsrf, clearSessionCookie } from "../auth/session";
import { verifyPassword } from "../auth/password";
import { purgeUser } from "../auth/service";
import { httpError, toPublicUser } from "../lib/errors";
import { parseBody } from "../lib/validate";

interface AccountRouteOptions {
    db: Db;
    env: Env;
}

const accountRoutes: FastifyPluginAsync<AccountRouteOptions> = async (
    app,
    { db, env },
) => {
    const guard = requireAuth(db, env);
    const users = db.collection<UserDoc>("users");
    const saves = db.collection<SaveDoc>("saves");
    const sessions = db.collection<SessionDoc>("sessions");

    app.get("/", { preHandler: guard }, async (req) => ({
        user: toPublicUser(authOf(req).user),
    }));

    app.patch("/", { preHandler: guard }, async (req) => {
        const auth = authOf(req);
        assertCsrf(req, env, auth.session);

        const input = parseBody(profileSchema, req.body);
        const displayName = input.displayName.trim();
        const now = new Date();

        await users.updateOne(
            { _id: auth.user._id },
            { $set: { displayName, updatedAt: now } },
        );

        return {
            user: toPublicUser({ ...auth.user, displayName, updatedAt: now }),
        };
    });

    app.get("/export", { preHandler: guard }, async (req, reply) => {
        const auth = authOf(req);
        const save = await saves.findOne({ _id: auth.user._id });

        reply.header(
            "content-disposition",
            `attachment; filename="cinderfall-${auth.user._id}.json"`,
        );
        reply.header("cache-control", "no-store");

        return {
            schemaVersion: 1,
            exportedAt: new Date().toISOString(),
            user: toPublicUser(auth.user),
            save: save ?? null,
        };
    });

    app.delete("/", { preHandler: guard }, async (req, reply) => {
        const auth = authOf(req);
        assertCsrf(req, env, auth.session);

        if (!auth.user.isGuest) {
            const input = parseBody(deleteAccountSchema, req.body ?? {});
            if (!input.password) {
                throw httpError(
                    400,
                    "password_required",
                    "Enter your password to delete the account",
                );
            }
            const ok = auth.user.passwordHash
                ? await verifyPassword(auth.user.passwordHash, input.password)
                : false;
            if (!ok) {
                throw httpError(403, "invalid_password", "Wrong password");
            }
        }

        await purgeUser(db, auth.user._id);
        clearSessionCookie(reply, env);
        return { ok: true };
    });

    app.get("/sessions", { preHandler: guard }, async (req) => {
        const auth = authOf(req);
        const rows = await sessions
            .find({ userId: auth.user._id })
            .sort({ createdAt: -1 })
            .toArray();

        return {
            sessions: rows.map((session) => ({
                id: session._id,
                createdAt: session.createdAt.toISOString(),
                lastUsedAt: session.lastUsedAt.toISOString(),
                expiresAt: session.expiresAt.toISOString(),
                ip: session.ip,
                userAgent: session.userAgent,
                current: session._id === auth.session._id,
            })),
        };
    });

    app.delete("/sessions/:id", { preHandler: guard }, async (req, reply) => {
        const auth = authOf(req);
        assertCsrf(req, env, auth.session);

        const { id } = req.params as { id: string };
        const result = await sessions.deleteOne({
            _id: id,
            userId: auth.user._id,
        });

        if (!result.deletedCount) {
            throw httpError(404, "not_found", "Session not found");
        }
        if (id === auth.session._id) clearSessionCookie(reply, env);

        return { ok: true };
    });

    app.post(
        "/sessions/revoke-others",
        { preHandler: guard },
        async (req) => {
            const auth = authOf(req);
            assertCsrf(req, env, auth.session);

            const result = await sessions.deleteMany({
                userId: auth.user._id,
                _id: { $ne: auth.session._id },
            });

            return { revoked: result.deletedCount };
        },
    );
};

export default accountRoutes;
