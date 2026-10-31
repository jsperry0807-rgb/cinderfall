import { useGameStore, type TabId } from "../../game/store";
import { ForgeTab } from "./ForgeTab";
import { GearTab } from "./GearTab";
import { SkillsTab } from "./SkillsTab";
import { SoulsTab } from "./SoulsTab";

const TABS: Array<{ id: TabId; label: string }> = [
    { id: "gear", label: "Gear" },
    { id: "tree", label: "Skills" },
    { id: "forge", label: "Forge" },
    { id: "souls", label: "Souls" },
];

export function SidePanel() {
    const tab = useGameStore((s) => s.tab);
    const setTab = useGameStore((s) => s.setTab);
    const invCount = useGameStore((s) => s.snap?.inv.length ?? 0);
    const sp = useGameStore((s) => s.snap?.sp ?? 0);

    return (
        <section className="panel side" aria-label="Inventory and upgrades">
            <div className="tabs" role="tablist">
                {TABS.map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={tab === t.id}
                        className={tab === t.id ? "on" : ""}
                        onClick={() => setTab(t.id)}
                    >
                        {t.label}
                        {t.id === "gear" ? ` ${invCount}/30` : ""}
                        {t.id === "tree" && sp > 0 ? ` (${sp})` : ""}
                    </button>
                ))}
            </div>

            <div className="scroll">
                {tab === "gear" && <GearTab />}
                {tab === "tree" && <SkillsTab />}
                {tab === "forge" && <ForgeTab />}
                {tab === "souls" && <SoulsTab />}
            </div>
        </section>
    );
}
