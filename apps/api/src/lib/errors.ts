import type { PublicUser, UserDoc } from "../db/types";

export class ApiError extends Error {
    readonly statusCode: number;
    readonly code: string;
    readonly details?: unknown;

    constructor(
        statusCode: number,
        code: string,
        message: string,
        details?: unknown,
    ) {
        super(message);
        this.name = "ApiError";
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
    }
}

export const httpError = (
    statusCode: number,
    code: string,
    message: string,
    details?: unknown,
): ApiError => new ApiError(statusCode, code, message, details);

export const toPublicUser = (user: UserDoc): PublicUser => ({
    id: user._id,
    email: user.email,
    displayName: user.displayName,
    isGuest: user.isGuest,
    emailVerified: user.emailVerifiedAt !== null,
    createdAt: user.createdAt.toISOString(),
});
