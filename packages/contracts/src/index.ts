// Request schemas shared by the API and the web client.

import { z } from "zod";

const displayName = z
    .string()
    .trim()
    .min(3, "Use at least 3 characters")
    .max(20, "Use at most 20 characters")
    .regex(
        /^[\p{L}\p{N} _-]+$/u,
        "Letters, numbers, spaces, underscore and hyphen only",
    );

export const signupSchema = z.object({
    email: z.email("Enter a valid email").max(254),
    password: z
        .string()
        .min(10, "Use at least 10 characters")
        .max(128, "Use at most 128 characters"),
    displayName,
});

export const loginSchema = z.object({
    email: z.email("Enter a valid email").max(254),
    password: z.string().min(1).max(128),
});

export const profileSchema = z.object({
    displayName,
});

export const deleteAccountSchema = z.object({
    password: z.string().max(128).optional(),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

export const saveSchema = z.object({
    state: z.unknown(),
    simClock: z
        .number()
        .refine(Number.isFinite, "simClock must be finite")
        .min(0),
    expectedRevision: z.number().int().min(1),
});

export type SaveInput = z.infer<typeof saveSchema>;

export const emailRequestSchema = z.object({
    email: z.email("Enter a valid email").max(254),
});

export const tokenSchema = z.object({
    token: z.string().min(20, "Invalid link").max(256, "Invalid link"),
});

export const resetPasswordSchema = z.object({
    token: z.string().min(20, "Invalid link").max(256, "Invalid link"),
    password: z
        .string()
        .min(10, "Use at least 10 characters")
        .max(128, "Use at most 128 characters"),
});

export type EmailRequestInput = z.infer<typeof emailRequestSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
