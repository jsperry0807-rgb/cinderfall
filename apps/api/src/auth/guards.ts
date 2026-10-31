import type { FastifyReply, FastifyRequest } from "fastify";
import type { Db } from "mongodb";
import type { Env } from "../env";
import { readAuth } from "./session";
import { httpError } from "../lib/errors";

export function requireAuth(db: Db, env: Env) {
    return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
        const auth = await readAuth(req, reply, db, env);
        if (!auth) {
            throw httpError(401, "unauthenticated", "Sign in first");
        }
        req.auth = auth;
    };
}

export function authOf(req: FastifyRequest): NonNullable<FastifyRequest["auth"]> {
    if (!req.auth) {
        throw httpError(401, "unauthenticated", "Sign in first");
    }
    return req.auth;
}
