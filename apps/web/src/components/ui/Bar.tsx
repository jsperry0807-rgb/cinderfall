interface BarProps {
    value: number;
    max: number;
    tone?: "hp" | "xp" | "foe";
    className?: string;
}

export function Bar({ value, max, tone, className }: BarProps) {
    const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
    return (
        <div
            className={["bar", tone, className].filter(Boolean).join(" ")}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct)}
        >
            <i style={{ width: `${pct}%` }} />
        </div>
    );
}
