import { useEffect, useRef, useState } from "react";
import { fx } from "../game/fx";

export function BossWarning() {
    const [msg, setMsg] = useState<string | null>(null);
    const timer = useRef<number | undefined>(undefined);

    useEffect(
        () =>
            fx.subscribe((event) => {
                if (event.kind !== "warn") return;
                setMsg(event.msg);
                window.clearTimeout(timer.current);
                timer.current = window.setTimeout(() => setMsg(null), 1_900);
            }),
        [],
    );

    useEffect(() => () => window.clearTimeout(timer.current), []);

    return (
        <div className={`boss-warn${msg ? " show" : ""}`} aria-hidden={!msg}>
            {msg}
        </div>
    );
}
