import { useEffect, useRef } from "react";
import { fn } from "@cinderfall/sim";
import { fx } from "../../game/fx";

export function FxLayer() {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const container = ref.current;
        if (!container) return;

        // Remove on animationend, but never rely on it: reduced-motion users,
        // hidden tabs and interrupted animations never fire the event.
        const autoRemove = (node: HTMLElement, ms: number): void => {
            const timer = window.setTimeout(() => node.remove(), ms);
            node.addEventListener(
                "animationend",
                () => {
                    window.clearTimeout(timer);
                    node.remove();
                },
                { once: true },
            );
        };

        const cap = (): void => {
            while (container.childElementCount > 80) {
                container.firstElementChild?.remove();
            }
        };

        const float = (text: string, cls: string, y: number): void => {
            const node = document.createElement("span");
            node.className = `float ${cls}`;
            node.textContent = text;
            node.style.left = `${50 + (Math.random() * 70 - 35)}%`;
            node.style.top = `${y + (Math.random() * 10 - 5)}%`;
            container.appendChild(node);
            autoRemove(node, 1_500);
            cap();
        };

        const burst = (): void => {
            for (let i = 0; i < 16; i++) {
                const p = document.createElement("div");
                p.className = "burst";
                p.style.left = "50%";
                p.style.top = "45%";
                const angle = (Math.PI * 2 * i) / 16;
                const distance = 45 + Math.random() * 55;
                p.style.setProperty(
                    "--dx",
                    `${(Math.cos(angle) * distance).toFixed(0)}px`,
                );
                p.style.setProperty(
                    "--dy",
                    `${(Math.sin(angle) * distance).toFixed(0)}px`,
                );
                const color = Math.random() < 0.5 ? "#ff7b2e" : "#ffd24a";
                p.style.background = color;
                p.style.color = color;
                container.appendChild(p);
                autoRemove(p, 1_000);
                cap();
            }
        };

        return fx.subscribe((event) => {
            switch (event.kind) {
                case "hit": {
                    const text =
                        (event.multihit ? "⚔ " : "") +
                        (event.crit >= 2
                            ? `${fn(event.dmg)} ×${event.crit}`
                            : fn(event.dmg));
                    const cls =
                        event.crit >= 3
                            ? "c3"
                            : event.crit === 2
                              ? "c2"
                              : event.crit === 1
                                ? "c"
                                : "n";
                    float(text, cls, 36);
                    break;
                }
                case "playerHit":
                    float(`-${fn(event.dmg)}`, "p", 86);
                    break;
                case "thorns":
                    float(fn(event.dmg), "n", 58);
                    break;
                case "burst":
                    burst();
                    break;
                case "warn":
                    break;
            }
        });
    }, []);

    return <div className="fx" ref={ref} aria-hidden="true" />;
}
