// Email delivery. "console" keeps messages in memory (dev) and logs them;
// "resend" posts to the Resend API.

import type { Env } from "../env";

export interface MailMessage {
    to: string;
    subject: string;
    text: string;
    at: string;
}

export interface Mailer {
    readonly kind: "console" | "resend" | "disabled";
    send(message: { to: string; subject: string; text: string }): Promise<void>;
}

export class ConsoleMailer implements Mailer {
    readonly kind = "console" as const;
    readonly messages: MailMessage[] = [];

    async send({
        to,
        subject,
        text,
    }: {
        to: string;
        subject: string;
        text: string;
    }): Promise<void> {
        this.messages.push({
            to,
            subject,
            text,
            at: new Date().toISOString(),
        });
        if (this.messages.length > 50) this.messages.shift();
        console.info(`[mail] to=${to} subject="${subject}"\n${text}`);
    }
}

/** Production without a real provider: never log or store a token. */
class DisabledMailer implements Mailer {
    readonly kind = "disabled" as const;

    async send({ to }: { to: string }): Promise<void> {
        console.info(`[mail] delivery disabled (to=${to})`);
    }
}

class ResendMailer implements Mailer {
    readonly kind = "resend" as const;

    constructor(
        private readonly apiKey: string,
        private readonly from: string,
    ) {}

    async send({
        to,
        subject,
        text,
    }: {
        to: string;
        subject: string;
        text: string;
    }): Promise<void> {
        const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                authorization: `Bearer ${this.apiKey}`,
                "content-type": "application/json",
            },
            body: JSON.stringify({
                from: this.from,
                to,
                subject,
                text,
            }),
        });

        if (!response.ok) {
            throw new Error(
                `Resend rejected the message (${response.status}): ${await response.text()}`,
            );
        }
    }
}

export function createMailer(env: Env): {
    mailer: Mailer;
    inbox: ConsoleMailer | null;
} {
    if (!env.emailEnabled) {
        return { mailer: new DisabledMailer(), inbox: null };
    }

    if (env.MAILER === "resend") {
        if (!env.RESEND_API_KEY || !env.MAIL_FROM) {
            throw new Error("MAILER=resend requires RESEND_API_KEY and MAIL_FROM");
        }
        return {
            mailer: new ResendMailer(env.RESEND_API_KEY, env.MAIL_FROM),
            inbox: null,
        };
    }

    const inbox = new ConsoleMailer();
    return { mailer: inbox, inbox };
}
