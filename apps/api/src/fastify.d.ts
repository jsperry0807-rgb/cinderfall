import type { FastifyRequest } from "fastify";
import type { SessionDoc, UserDoc } from "../db/types";

declare module "fastify" {
    interface FastifyRequest {
        auth?: {
            session: SessionDoc;
            user: UserDoc;
        };
    }
}

export type AuthedRequest = FastifyRequest & {
    auth: { session: SessionDoc; user: UserDoc };
};
