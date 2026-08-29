/** Locked scoring model. See spec section 5. */
import type { LevelEnvelope } from './protocol.js';

const BASE = 100;
const TIME_BONUS_MAX = 50;
const TIME_BONUS_WINDOW_MS = 120_000;
const BOSS_BASE = 300;
const BOSS_PER_FINDING = 25;

export function scoreLevel(level: LevelEnvelope, answeredAt: number): number {
  if (level.type === 'boss') {
    const resolutions = (level.answer as { resolutions?: unknown[] })?.resolutions ?? [];
    return BOSS_BASE + BOSS_PER_FINDING * resolutions.length;
  }
  const elapsed = answeredAt - level.createdAt;
  const bonus = elapsed >= TIME_BONUS_WINDOW_MS ? 0 : Math.round(TIME_BONUS_MAX * (1 - elapsed / TIME_BONUS_WINDOW_MS));
  return BASE + Math.max(0, bonus);
}
