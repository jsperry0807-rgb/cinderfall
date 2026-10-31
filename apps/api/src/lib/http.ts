// Cross-cutting HTTP guards.

import type { FastifyRequest } from "fastify";
import type { Env } from "../env";
import { httpError } from "./errors";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Reject state-changing requests that clearly came from another origin.
 * SameSite=Lax already blocks the cookie on cross-site POSTs; this is defence in
 * depth and also catches misconfigured clients.
 */
export function originGuard(env: Env) {
    return async (req: FastifyRequest): Promise<void> => {
        if (!MUTATING.has(req.method)) return;
        const origin = req.headers.origin;
        if (origin && origin !== env.PUBLIC_ORIGIN) {
            throw httpError(403, "bad_origin", "Cross-origin request rejected");
        }
    };
}
