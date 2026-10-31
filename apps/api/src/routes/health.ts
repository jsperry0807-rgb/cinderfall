import type { FastifyPluginAsync } from "fastify";
import type { Db } from "mongodb";

const healthRoutes: FastifyPluginAsync<{ db: Db }> = async (app, { db }) => {
    app.get("/healthz", { config: { rateLimit: false } }, async () => ({
        ok: true,
    }));

    app.get("/readyz", { config: { rateLimit: false } }, async (_req, reply) => {
        try {
            await db.command({ ping: 1 });
            return { ok: true };
        } catch {
            return reply.code(503).send({ ok: false });
        }
    });
};

export default healthRoutes;
