// Skill branches and active skills.

import type { SkillDef, SkillId } from "../types";

export const BR: string[] = ["Carnage", "Bulwark", "Fortune", "Devastation", "Ascension"];
export const SK: Record<SkillId, SkillDef> = {
    whirl: { n: "Whirlwind", cd: 8, mult: 6 },
    reckoning: { n: "Reckoning", cd: 20, mult: 10 },
    cataclysm: { n: "Cataclysm", cd: 30, mult: 20 },
    cry: { n: "Battle Cry", cd: 25 },
};
