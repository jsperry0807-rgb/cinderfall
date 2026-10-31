import { hash, verify } from "@node-rs/argon2";
import type { Algorithm } from "@node-rs/argon2";

// OWASP baseline: 19 MiB, 2 iterations, 1 lane, Argon2id.
const OPTIONS = {
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
    // Argon2id: the library's const enum cannot be imported as a value under
    // verbatimModuleSyntax.
    algorithm: 2 as Algorithm,
};

export const hashPassword = (password: string): Promise<string> =>
    hash(password, OPTIONS);

export async function verifyPassword(
    hashed: string,
    password: string,
): Promise<boolean> {
    try {
        return await verify(hashed, password, OPTIONS);
    } catch {
        return false;
    }
}

// Verifying against a real hash when the account does not exist keeps the
// response time similar and avoids leaking which emails are registered.
let dummy: Promise<string> | null = null;
export const dummyHash = (): Promise<string> =>
    (dummy ??= hashPassword("cinderfall-timing-equaliser"));

const COMMON = new Set([
    "password123",
    "password1234",
    "1234567890",
    "qwertyuiop",
    "letmein123",
    "iloveyou123",
    "admin12345",
    "welcome123",
]);

export const isCommonPassword = (password: string): boolean =>
    COMMON.has(password.toLowerCase());
