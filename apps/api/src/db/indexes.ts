// Idempotent index creation. Run at boot (or as a deploy step).

import type { Db } from "mongodb";

export async function ensureIndexes(db: Db): Promise<void> {
    // Account lookup. Guests have emailLower = null, hence the partial index.
    await db.collection("users").createIndex(
        { emailLower: 1 },
        {
            name: "users_email_lower_uq",
            unique: true,
            partialFilterExpression: { emailLower: { $type: "string" } },
        },
    );
    // Guest cleanup job: delete inactive guests after 30 days.
    await db
        .collection("users")
        .createIndex(
            { isGuest: 1, lastSeenAt: 1 },
            { name: "users_guest_last_seen" },
        );

    await db
        .collection("sessions")
        .createIndex(
            { tokenHash: 1 },
            { name: "sessions_token_uq", unique: true },
        );
    await db
        .collection("sessions")
        .createIndex({ userId: 1 }, { name: "sessions_user" });
    await db
        .collection("sessions")
        .createIndex(
            { expiresAt: 1 },
            { name: "sessions_ttl", expireAfterSeconds: 0 },
        );

    await db
        .collection("tokens")
        .createIndex(
            { tokenHash: 1 },
            { name: "tokens_token_uq", unique: true },
        );
    await db
        .collection("tokens")
        .createIndex(
            { expiresAt: 1 },
            { name: "tokens_ttl", expireAfterSeconds: 0 },
        );

    // saves._id is the user id and is unique by definition.
}
