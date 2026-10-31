import type { Db } from "mongodb";
import type { SaveDoc, SessionDoc, TokenDoc, UserDoc } from "../db/types";

/** Remove a user and everything owned by them. */
export async function purgeUser(db: Db, userId: string): Promise<void> {
    await Promise.all([
        db.collection<SaveDoc>("saves").deleteOne({ _id: userId }),
        db.collection<SessionDoc>("sessions").deleteMany({ userId }),
        db.collection<TokenDoc>("tokens").deleteMany({ userId }),
        db.collection<UserDoc>("users").deleteOne({ _id: userId }),
    ]);
}
