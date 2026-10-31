import { MongoClient, type Db } from "mongodb";

export interface MongoConnection {
    client: MongoClient;
    db: Db;
}

/**
 * Connect to MongoDB. `memory://` is handled by main.ts before this is called.
 */
export async function connectMongo(
    uri: string,
    dbName: string,
): Promise<MongoConnection> {
    if (!uri || uri === "memory://") {
        throw new Error("connectMongo needs a real MONGODB_URI");
    }
    const client = new MongoClient(uri, {
        serverSelectionTimeoutMS: 5_000,
        retryWrites: true,
    });
    await client.connect();
    return { client, db: client.db(dbName) };
}
