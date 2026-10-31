// Fastify factory. No listen() here, so tests can use app.inject().

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import type { Db } from "mongodb";
import { ZodError } from "zod";
import type { Env } from "./env";
import authRoutes from "./auth/routes";
import healthRoutes from "./routes/health";
import accountRoutes from "./account/routes";
import gameRoutes from "./game/routes";
import { ApiError } from "./lib/errors";
import { originGuard } from "./lib/http";
import { createMailer } from "./auth/mailer";

export interface ServerOptions {
    env: Env;
    db: Db;
}

export async function buildServer({
    env,
    db,
}: ServerOptions): Promise<FastifyInstance> {
    const app = Fastify({
        logger:
            env.NODE_ENV === "test"
                ? false
                : {
                      level: env.LOG_LEVEL,
                      redact: [
                          "req.headers.cookie",
                          "req.headers.authorization",
                          "res.headers.set-cookie",
                      ],
                  },
        trustProxy: env.trustProxy,
        bodyLimit: 64 * 1024,
    });

    await app.register(cookie);
    await app.register(helmet, {
        contentSecurityPolicy:
            env.NODE_ENV === "production"
                ? {
                      directives: {
                          defaultSrc: ["'self'"],
                          scriptSrc: ["'self'"],
                          // React writes inline styles (bars, custom props).
                          styleSrc: ["'self'", "'unsafe-inline'"],
                          fontSrc: ["'self'"],
                          imgSrc: ["'self'", "data:"],
                          connectSrc: ["'self'"],
                          objectSrc: ["'none'"],
                          baseUri: ["'self'"],
                          formAction: ["'self'"],
                          frameAncestors: ["'none'"],
                      },
                  }
                : false,
        crossOriginEmbedderPolicy: false,
    });
    await app.register(rateLimit, {
        global: true,
        max: 120,
        timeWindow: "1 minute",
    });

    app.addHook("onRequest", originGuard(env));

    app.addHook("onSend", async (req, reply, payload) => {
        if (req.url.startsWith("/api/")) {
            reply.header("cache-control", "no-store");
        }
        return payload;
    });

    app.setErrorHandler((err, req, reply) => {
        if (err instanceof ApiError) {
            return reply.code(err.statusCode).send({
                error: {
                    code: err.code,
                    message: err.message,
                    ...(err.details === undefined
                        ? {}
                        : { details: err.details }),
                },
            });
        }
        if (err instanceof ZodError) {
            return reply.code(400).send({
                error: {
                    code: "invalid_input",
                    message: "Invalid request",
                    details: err.issues,
                },
            });
        }
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 429) {
            return reply.code(429).send({
                error: {
                    code: "rate_limited",
                    message: "Too many requests",
                },
            });
        }
        // Malformed JSON, unsupported media type, body too large, etc.
        if (status && status >= 400 && status < 500) {
            return reply.code(status).send({
                error: { code: "bad_request", message: "Invalid request" },
            });
        }

        req.log.error({ err }, "unhandled error");
        return reply.code(500).send({
            error: { code: "internal", message: "Internal server error" },
        });
    });

    if (env.WEB_DIST) {
        const root = resolve(env.WEB_DIST);
        if (!existsSync(join(root, "index.html"))) {
            throw new Error(`WEB_DIST has no index.html: ${root}`);
        }
        await app.register(fastifyStatic, {
            root,
            prefix: "/",
            wildcard: true,
            setHeaders(reply, filePath) {
                if (filePath.includes(`${join(root, "assets")}`)) {
                    reply.header(
                        "cache-control",
                        "public, max-age=31536000, immutable",
                    );
                } else if (filePath.endsWith("index.html")) {
                    reply.header("cache-control", "no-cache");
                } else if (filePath.includes(`${join(root, "fonts")}`)) {
                    reply.header(
                        "cache-control",
                        "public, max-age=31536000, immutable",
                    );
                }
            },
        });
    }

    app.setNotFoundHandler((req, reply) => {
        const wantsHtml = (req.headers.accept ?? "").includes("text/html");
        if (
            env.WEB_DIST &&
            req.method === "GET" &&
            wantsHtml &&
            !req.url.startsWith("/api/")
        ) {
            return reply.type("text/html; charset=utf-8").sendFile("index.html");
        }
        return reply
            .code(404)
            .send({ error: { code: "not_found", message: "Not found" } });
    });

    const { mailer, inbox } = createMailer(env);

    app.get("/api/config", async () => ({
        // In production without a real provider the reset/verify UI is hidden.
        emailEnabled: env.emailEnabled,
    }));

    if (inbox && env.NODE_ENV !== "production") {
        // Dev-only mailbox so the browser can follow console-mailed links.
        app.get(
            "/api/dev/mail",
            { config: { rateLimit: false } },
            async () => ({ messages: inbox.messages }),
        );
    }

    await app.register(authRoutes, { prefix: "/api/auth", db, env, mailer });
    await app.register(accountRoutes, { prefix: "/api/me", db, env });
    await app.register(gameRoutes, { prefix: "/api/game", db, env });
    await app.register(healthRoutes, { db });

    return app;
}
