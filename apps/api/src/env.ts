// Environment configuration, validated once at boot.
//
// Required in production: SESSION_SECRET and a non-default PUBLIC_ORIGIN.
// `MONGODB_URI=memory://` starts an in-memory MongoDB (development/test only).

import { z } from "zod";

const DEV_ORIGIN = "http://localhost:5173";
const DEV_SECRET = "dev-only-secret-change-me-0123456789abcdef";

/** Compose passes unset optional values as ""; treat them as absent. */
const optionalString = (min: number) =>
    z.preprocess(
        (value) => (value === "" ? undefined : value),
        z.string().min(min).optional(),
    );

const RawEnv = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    HOST: z.string().min(1).default("127.0.0.1"),
    PORT: z.coerce.number().int().min(1).max(65535).default(8787),

    MONGODB_URI: z.string().min(1).default("memory://"),
    DB_NAME: z.string().min(1).default("cinderfall"),

    PUBLIC_ORIGIN: z.string().url().default(DEV_ORIGIN),
    COOKIE_SECURE: z.enum(["true", "false"]).optional(),
    SESSION_SECRET: z.string().min(32).optional(),
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    SESSION_ABSOLUTE_DAYS: z.coerce.number().int().min(1).max(365).default(90),

    TRUST_PROXY: z.enum(["true", "false"]).default("false"),
    LOG_LEVEL: z
        .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
        .default("info"),

    /** Guest accounts allowed per IP per hour. */
    GUEST_RATE_LIMIT: z.coerce.number().int().min(1).max(10_000).default(10),
    /** Signups allowed per IP per hour. */
    SIGNUP_RATE_LIMIT: z.coerce.number().int().min(1).max(10_000).default(10),
    /** Login attempts allowed per IP per minute. */
    LOGIN_RATE_LIMIT: z.coerce.number().int().min(1).max(10_000).default(30),
    /** Maximum offline progress simulated per absence. */
    OFFLINE_CAP_HOURS: z.coerce.number().min(0.1).max(168).default(8),

    /** Built SPA directory. When set, the API serves the client too. */
    WEB_DIST: z.string().min(1).optional(),

    /** How verification and reset emails are delivered. */
    MAILER: z.enum(["console", "resend"]).default("console"),
    MAIL_FROM: optionalString(3),
    RESEND_API_KEY: optionalString(10),
});

export type Env = Omit<z.infer<typeof RawEnv>, "SESSION_SECRET"> & {
    SESSION_SECRET: string;
    cookieSecure: boolean;
    cookieName: string;
    trustProxy: boolean;
    emailEnabled: boolean;
};

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
    const parsed = RawEnv.parse(source);
    const isProd = parsed.NODE_ENV === "production";

    if (isProd && !parsed.SESSION_SECRET) {
        throw new Error("SESSION_SECRET is required in production");
    }
    if (isProd && parsed.PUBLIC_ORIGIN === DEV_ORIGIN) {
        throw new Error("PUBLIC_ORIGIN must be set in production");
    }
    if (isProd && parsed.MONGODB_URI === "memory://") {
        throw new Error("MONGODB_URI=memory:// is not allowed in production");
    }
    if (parsed.MAILER === "resend" && (!parsed.RESEND_API_KEY || !parsed.MAIL_FROM)) {
        throw new Error("MAILER=resend requires RESEND_API_KEY and MAIL_FROM");
    }

    const cookieSecure = parsed.COOKIE_SECURE
        ? parsed.COOKIE_SECURE === "true"
        : isProd;

    return {
        ...parsed,
        SESSION_SECRET: parsed.SESSION_SECRET ?? DEV_SECRET,
        cookieSecure,
        trustProxy: parsed.TRUST_PROXY === "true",
        emailEnabled: parsed.MAILER === "resend" || !isProd,
        // The __Host- prefix requires Secure + Path=/ and forbids Domain.
        cookieName: cookieSecure ? "__Host-cf_session" : "cf_session",
    };
}

/** For tests and embedders: build a validated env without touching process.env. */
export function testEnv(overrides: Partial<Record<string, string>> = {}): Env {
    return loadEnv({
        NODE_ENV: "test",
        PUBLIC_ORIGIN: DEV_ORIGIN,
        SESSION_SECRET: "x".repeat(48),
        MONGODB_URI: "mongodb://127.0.0.1:27017",
        ...overrides,
    } as NodeJS.ProcessEnv);
}
