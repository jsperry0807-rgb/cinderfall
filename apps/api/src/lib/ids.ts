import { v7 as uuidv7 } from "uuid";

/** UUIDv7: time-ordered, safe to generate in the app. */
export const newId = (): string => uuidv7();
