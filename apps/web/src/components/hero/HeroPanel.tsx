import { EquipmentGrid } from "./EquipmentGrid";
import { StatSheet } from "./StatSheet";

export function HeroPanel() {
    return (
        <section className="panel hero" aria-labelledby="hero-title">
            <h2 id="hero-title">Hero</h2>
            <EquipmentGrid />
            <StatSheet />
        </section>
    );
}
