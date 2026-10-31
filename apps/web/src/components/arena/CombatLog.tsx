import { useGameStore } from "../../game/store";

export function CombatLog() {
    const log = useGameStore((s) => s.log);

    return (
        <div className="log" aria-live="polite" aria-label="Combat log">
            {log.map((entry) => (
                <div key={entry.id} style={entry.color ? { color: entry.color } : undefined}>
                    {entry.text}
                </div>
            ))}
        </div>
    );
}
