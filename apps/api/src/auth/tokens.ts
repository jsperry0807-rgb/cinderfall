// One-time tokens for email verification and password reset.
// Only the SHA-256 of the token is stored.

import { randomBytes } from "node:crypto";
import type { Db } from "mongodb";
import { newId } from "../lib/ids";
import type { TokenDoc } from "../db/types";
import { hashToken } from "./session";

export const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
export const RESET_TTL_MS = 60 * 60 * 1000;

export async function issueToken(
    db: Db,
    userId: string,
    purpose: TokenDoc["purpose"],
    ttlMs: number,
): Promise<string> {
    const tokens = db.collection<TokenDoc>("tokens");

    // Only the newest link for a purpose should work.
    await tokens.deleteMany({ userId, purpose, usedAt: null });

    const raw = randomBytes(32).toString("base64url");
    await tokens.insertOne({
        _id: newId(),
        userId,
        purpose,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + ttlMs),
        usedAt: null,
    });
    return raw;
}

/** Atomically consume a token; returns null when invalid, used or expired. */
export async function consumeToken(
    db: Db,
    raw: string,
    purpose: TokenDoc["purpose"],
): Promise<TokenDoc | null> {
    const tokens = db.collection<TokenDoc>("tokens");
    const now = new Date();
    return tokens.findOneAndUpdate(
        {
            tokenHash: hashToken(raw),
            purpose,
            usedAt: null,
            expiresAt: { $gt: now },
        },
        { $set: { usedAt: now } },
        { returnDocument: "after" },
    );
}
