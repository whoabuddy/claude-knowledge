import { join } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import type { HygieneState } from "../types";

const HOME = process.env.HOME || "/home/whoabuddy";
const STATE_DIR = join(HOME, ".claude", ".hygiene");
const STATE_FILE = join(STATE_DIR, "state.json");

const DEFAULT_STATE: HygieneState = {
  version: 1,
  archivedSessions: [],
  scoredSessions: [],
  lastRun: {},
};

/** Load hygiene state, creating defaults if missing */
export function loadState(): HygieneState {
  if (!existsSync(STATE_FILE)) return { ...DEFAULT_STATE };

  try {
    const text = readFileSync(STATE_FILE, "utf-8");
    const data = JSON.parse(text) as HygieneState;
    return {
      ...DEFAULT_STATE,
      ...data,
      lastRun: { ...DEFAULT_STATE.lastRun, ...data.lastRun },
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

/** Save hygiene state */
export function saveState(state: HygieneState): void {
  if (!existsSync(STATE_DIR)) {
    mkdirSync(STATE_DIR, { recursive: true });
  }
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n");
}

/** Mark a session as archived in state */
export function markArchived(state: HygieneState, sessionId: string): void {
  if (!state.archivedSessions.includes(sessionId)) {
    state.archivedSessions.push(sessionId);
  }
}

/** Mark a session as scored in state */
export function markScored(state: HygieneState, sessionId: string): void {
  if (!state.scoredSessions.includes(sessionId)) {
    state.scoredSessions.push(sessionId);
  }
}

/** Check if a session has been archived */
export function isArchived(state: HygieneState, sessionId: string): boolean {
  return state.archivedSessions.includes(sessionId);
}

/** Check if a session has been scored */
export function isScored(state: HygieneState, sessionId: string): boolean {
  return state.scoredSessions.includes(sessionId);
}

/** Update last run timestamp for a command */
export function stampLastRun(state: HygieneState, command: keyof HygieneState["lastRun"]): void {
  state.lastRun[command] = new Date().toISOString();
}
