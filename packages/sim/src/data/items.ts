// Item slots, rarities, affix and base-item tables.

import type {
    AffixDef,
    BaseTable,
    Rarity,
    SlotId,
    StatKey,
} from "../types";

export const SLOTS = [
    "weapon",
    "helm",
    "chest",
    "gloves",
    "boots",
    "ring",
    "amulet",
] as const;
export const ICON: Record<SlotId, string> = {
    weapon: "🗡️",
    helm: "⛑️",
    chest: "🛡️",
    gloves: "🧤",
    boots: "🥾",
    ring: "💍",
    amulet: "📿",
};
export const R: Rarity[] = [
    { n: "Common", c: "#a39d92", a: [0, 0], w: 55 },
    { n: "Magic", c: "#5f95ff", a: [1, 2], w: 26 },
    { n: "Rare", c: "#f0c64a", a: [3, 4], w: 11 },
    { n: "Epic", c: "#c26bf0", a: [4, 5], w: 5 },
    { n: "Legendary", c: "#ff7b2e", a: [5, 6], w: 2.2 },
    { n: "Mythic", c: "#ff3d6f", a: [6, 7], w: 0.6 },
    { n: "Ancient", c: "#4af0d6", a: [7, 8], w: 0.2 },
    { n: "Divine", c: "#fff5d6", a: [8, 9], w: 0.05 },
];
export const FLAT: Set<StatKey> = new Set(["dmg", "life", "armor", "regen", "pxp"]);
export const AF: AffixDef[] = [
    ["p", "dmg", "Brutal", 2, 5],
    ["p", "dmgp", "Savage", 6, 14],
    ["p", "life", "Sturdy", 12, 30],
    ["p", "armor", "Ironclad", 5, 14],
    ["p", "regen", "Mending", 0.4, 1.2],
    ["s", "spd", "of Haste", 4, 10],
    ["s", "crit", "of the Assassin", 2, 6],
    ["s", "critd", "of Ruin", 12, 35],
    ["s", "gold", "of Greed", 8, 25],
    ["s", "mf", "of Fortune", 8, 25],
    ["s", "xp", "of Wisdom", 6, 18],
    ["s", "ls", "of the Leech", 1, 3],
    ["s", "armor", "of the Bastion", 5, 14],
    ["s", "life", "of the Bear", 12, 30],
];
export const B: BaseTable = {
    weapon: [
        ["Rusted Sword", 6, "dmg"],
        ["Hatchet", 7, "dmg"],
        ["Spiked Mace", 8, "dmg"],
        ["War Axe", 9, "dmg"],
    ],
    helm: [
        ["Iron Cap", 6, "armor"],
        ["Horned Helm", 8, "armor"],
    ],
    chest: [
        ["Leather Jerkin", 20, "life"],
        ["Chain Hauberk", 26, "life"],
    ],
    gloves: [
        ["Rag Wraps", 2, "dmg"],
        ["Spiked Gauntlets", 3, "dmg"],
    ],
    boots: [
        ["Worn Boots", 3, "spd"],
        ["Greaves", 4, "spd"],
    ],
    ring: [
        ["Bone Ring", 3, "crit"],
        ["Signet", 4, "crit"],
    ],
    amulet: [
        ["Fang Charm", 15, "life"],
        ["Ember Pendant", 20, "life"],
    ],
};
export const TITLES: string[] = [
    "Emberheart",
    "Gravewhisper",
    "Soulrend",
    "Dawnbreaker",
    "Wrathbone",
    "Nightfang",
];
