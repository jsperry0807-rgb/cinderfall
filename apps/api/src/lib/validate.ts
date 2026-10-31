import type { ZodType } from "zod";
import { httpError } from "./errors";

export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
    const result = schema.safeParse(body);
    if (!result.success) {
        throw httpError(
            400,
            "invalid_input",
            "Invalid request",
            result.error.issues,
        );
    }
    return result.data;
}
