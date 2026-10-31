// Creates the application database user on startup.
//
// Runs as root (MONGODB_ROOT_URI), then the entrypoint unsets the root
// credentials before the API process starts.

import { MongoClient } from "mongodb";

const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));

async function provision(): Promise<void> {
    const rootUri = process.env.MONGODB_ROOT_URI;
    const appUser = process.env.MONGO_APP_USER ?? "cinderfall";
    const appPassword = process.env.MONGO_APP_PASSWORD;
    const dbName = process.env.MONGO_DB_NAME ?? "cinderfall";

    if (!rootUri) throw new Error("MONGODB_ROOT_URI is not set");
    if (!appPassword) throw new Error("MONGO_APP_PASSWORD is not set");
    if (!/^[0-9a-f]+$/i.test(appPassword)) {
        throw new Error(
            "MONGO_APP_PASSWORD must be hex (openssl rand -hex 24)",
        );
    }

    for (let attempt = 1; attempt <= 30; attempt++) {
        const client = new MongoClient(rootUri, {
            serverSelectionTimeoutMS: 3000,
        });

        try {
            await client.connect();
            const db = client.db(dbName);
            const info = await db.command({ usersInfo: appUser });

            if (!info.users || info.users.length === 0) {
                await db.command({
                    createUser: appUser,
                    pwd: appPassword,
                    roles: [{ role: "readWrite", db: dbName }],
                });
                console.log(`[provision] created ${appUser} on ${dbName}`);
            } else {
                // Keep the database user in sync with .env so rotating the
                // password only needs an app restart.
                await db.command({ updateUser: appUser, pwd: appPassword });
                console.log(`[provision] synchronized ${appUser}`);
            }

            await client.close();
            return;
        } catch (err) {
            await client.close().catch(() => {});
            if (attempt === 30) throw err;
            console.log(`[provision] waiting for mongo (${attempt}/30)`);
            await sleep(2000);
        }
    }
}

provision().catch((err: unknown) => {
    console.error(
        "[provision] failed:",
        err instanceof Error ? err.message : err,
    );
    process.exit(1);
});
