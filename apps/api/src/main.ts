// Entry point: env, database, indexes, HTTP server, graceful shutdown.
//
// `MONGODB_URI=memory://` starts a throwaway MongoDB for local development.

import { loadEnv } from "./env";
import { connectMongo } from "./db/mongo";
import { ensureIndexes } from "./db/indexes";
import { buildServer } from "./server";

const env = loadEnv();

let memory: { getUri(): string; stop(): Promise<unknown> } | undefined;
let uri = env.MONGODB_URI;

if (uri === "memory://") {
    if (env.NODE_ENV === "production") {
        throw new Error("MONGODB_URI=memory:// is not allowed in production");
    }
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    const server = await MongoMemoryServer.create();
    memory = server;
    uri = server.getUri();
    console.info("[api] using in-memory MongoDB");
}

const { client, db } = await connectMongo(uri, env.DB_NAME);
await ensureIndexes(db);

const app = await buildServer({ env, db });
await app.listen({ host: env.HOST, port: env.PORT });
app.log.info(
    { port: env.PORT, origin: env.PUBLIC_ORIGIN },
    "cinderfall api listening",
);

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, "shutting down");
    await app.close();
    await client.close();
    if (memory) await memory.stop();
    process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
