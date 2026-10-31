import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MongoMemoryServer } from "mongodb-memory-server";
import type { FastifyInstance } from "fastify";
import type { Db, MongoClient } from "mongodb";
import { buildServer } from "../src/server";
import { connectMongo } from "../src/db/mongo";
import { loadEnv } from "../src/env";

let mongo: MongoMemoryServer;
let client: MongoClient;
let db: Db;
let webRoot: string;
let app: FastifyInstance;

beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    const conn = await connectMongo(mongo.getUri(), "cinderfall_static");
    client = conn.client;
    db = conn.db;

    webRoot = mkdtempSync(join(tmpdir(), "cinderfall-web-"));
    writeFileSync(
        join(webRoot, "index.html"),
        '<!doctype html><div id="root">app-shell</div>',
    );
    mkdirSync(join(webRoot, "assets"));
    writeFileSync(join(webRoot, "assets", "app.js"), "console.log('hi')");
    mkdirSync(join(webRoot, "fonts"));
    writeFileSync(join(webRoot, "fonts", "test.woff2"), "font-bytes");

    const env = loadEnv({
        NODE_ENV: "production",
        SESSION_SECRET: "x".repeat(48),
        PUBLIC_ORIGIN: "https://cinderfall.example",
        MONGODB_URI: "mongodb://127.0.0.1:27017/cinderfall",
        WEB_DIST: webRoot,
        MAILER: "console",
        LOG_LEVEL: "silent",
    });

    app = await buildServer({ env, db });
    await app.ready();
}, 120_000);

afterAll(async () => {
    await app?.close();
    await client?.close();
    await mongo?.stop();
    if (webRoot) rmSync(webRoot, { recursive: true, force: true });
});

describe("production static serving", () => {
    it("serves the SPA shell with a strict CSP", async () => {
        const res = await app.inject({ method: "GET", url: "/" });

        expect(res.statusCode).toBe(200);
        expect(res.headers["content-type"]).toMatch(/text\/html/);
        expect(res.body).toContain("app-shell");
        expect(res.headers["content-security-policy"]).toContain(
            "default-src 'self'",
        );
        expect(res.headers["content-security-policy"]).toContain(
            "script-src 'self'",
        );
        expect(res.headers["content-security-policy"]).toContain(
            "font-src 'self'",
        );
    });

    it("caches hashed assets and fonts immutably", async () => {
        const asset = await app.inject({
            method: "GET",
            url: "/assets/app.js",
        });
        expect(asset.statusCode).toBe(200);
        expect(asset.headers["cache-control"]).toContain("immutable");

        const font = await app.inject({
            method: "GET",
            url: "/fonts/test.woff2",
        });
        expect(font.statusCode).toBe(200);
        expect(font.headers["cache-control"]).toContain("immutable");
    });

    it("falls back to the SPA for client routes but not /api", async () => {
        const route = await app.inject({
            method: "GET",
            url: "/account",
            headers: { accept: "text/html" },
        });
        expect(route.statusCode).toBe(200);
        expect(route.body).toContain("app-shell");

        const missingApi = await app.inject({
            method: "GET",
            url: "/api/nope",
        });
        expect(missingApi.statusCode).toBe(404);
        expect(missingApi.json().error.code).toBe("not_found");

        const health = await app.inject({ method: "GET", url: "/healthz" });
        expect(health.statusCode).toBe(200);
    });
});
