import { spawn } from "node:child_process";
import { MongoMemoryServer } from "mongodb-memory-server";

const mongo = await MongoMemoryServer.create();
const env = {
    ...process.env,
    NODE_ENV: "production",
    HOST: "127.0.0.1",
    PORT: "8790",
    WEB_DIST: "/home/jace/rpg-web/new/apps/web/dist",
    MONGODB_URI: mongo.getUri(),
    SESSION_SECRET: "x".repeat(48),
    PUBLIC_ORIGIN: "https://cinderfall.example",
    MAILER: "console",
    LOG_LEVEL: "warn",
};

const child = spawn("pnpm", ["start"], {
    cwd: "/home/jace/rpg-web/new/apps/api",
    env,
    stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
child.stdout.on("data", (d) => (log += d));
child.stderr.on("data", (d) => (log += d));

const base = "http://127.0.0.1:8790";
let up = false;
for (let i = 0; i < 40; i++) {
    try {
        const r = await fetch(base + "/healthz");
        if (r.ok) { up = true; break; }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
}
if (!up) {
    console.error("server did not start\n" + log);
    child.kill("SIGKILL");
    await mongo.stop();
    process.exit(1);
}

const home = await fetch(base + "/");
const html = await home.text();
const csp = home.headers.get("content-security-policy") ?? "";
const font = await fetch(base + "/fonts/pirata-one-400-latin.woff2");
const spa = await fetch(base + "/account");
const config = await fetch(base + "/api/config").then((r) => r.json());
const ready = await fetch(base + "/readyz");

const report = {
    homeStatus: home.status,
    homeType: home.headers.get("content-type"),
    hasRoot: html.includes('id="root"'),
    hasAsset: /\/assets\/index-[^"]+\.js/.test(html),
    csp: csp.split(";").slice(0, 4).join(";"),
    fontStatus: font.status,
    fontType: font.headers.get("content-type"),
    spaFallback: spa.status,
    spaIsHtml: (await spa.text()).includes('id="root"'),
    config,
    ready: ready.status,
};
console.log(JSON.stringify(report, null, 2));

child.kill("SIGTERM");
await new Promise((r) => setTimeout(r, 800));
if (!child.killed) child.kill("SIGKILL");
await mongo.stop();
