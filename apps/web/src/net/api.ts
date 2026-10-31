// Thin fetch wrapper. Cookies are first-party (Vite proxies /api in dev).

export class ApiError extends Error {
    readonly status: number;
    readonly code: string;
    readonly details?: unknown;

    constructor(
        status: number,
        code: string,
        message: string,
        details?: unknown,
    ) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.code = code;
        this.details = details;
    }
}

type JsonBody = unknown;

async function request<T>(
    path: string,
    init: RequestInit = {},
    csrf?: string | null,
): Promise<T> {
    const headers = new Headers(init.headers);
    if (init.body && !headers.has("content-type")) {
        headers.set("content-type", "application/json");
    }
    if (csrf) headers.set("x-csrf-token", csrf);

    const res = await fetch(path, {
        credentials: "include",
        ...init,
        headers,
    });

    if (res.status === 204) return undefined as T;

    const text = await res.text();
    let data: unknown = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = null;
    }

    if (!res.ok) {
        const err = (
            data as {
                error?: { code?: string; message?: string; details?: unknown };
            } | null
        )?.error;
        throw new ApiError(
            res.status,
            err?.code ?? "http_error",
            err?.message ?? `HTTP ${res.status}`,
            err?.details,
        );
    }

    return data as T;
}

export const api = {
    get: <T>(path: string) => request<T>(path),
    post: <T>(path: string, body?: JsonBody, csrf?: string | null) =>
        request<T>(
            path,
            {
                method: "POST",
                body: body === undefined ? undefined : JSON.stringify(body),
            },
            csrf,
        ),
    put: <T>(path: string, body: JsonBody, csrf?: string | null) =>
        request<T>(
            path,
            { method: "PUT", body: JSON.stringify(body) },
            csrf,
        ),
    patch: <T>(path: string, body: JsonBody, csrf?: string | null) =>
        request<T>(
            path,
            { method: "PATCH", body: JSON.stringify(body) },
            csrf,
        ),
    del: <T>(path: string, body?: JsonBody, csrf?: string | null) =>
        request<T>(
            path,
            {
                method: "DELETE",
                body: body === undefined ? undefined : JSON.stringify(body),
            },
            csrf,
        ),
};

/** Download a JSON attachment from an authenticated endpoint. */
export async function download(path: string): Promise<void> {
    const res = await fetch(path, { credentials: "include" });
    if (!res.ok) {
        throw new ApiError(res.status, "download_failed", "Could not download");
    }

    const blob = await res.blob();
    const disposition = res.headers.get("content-disposition") ?? "";
    const match = /filename="?([^";]+)"?/.exec(disposition);
    const filename = match?.[1] ?? "cinderfall-export.json";

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_500);
}
