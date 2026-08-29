/**
 * Spec Quest level protocol v1.
 * The skill and this server must agree on PROTOCOL_VERSION.
 * Every level shares the same envelope; payload and answer shapes vary per type.
 */

export const PROTOCOL_VERSION = '1.0.0';

export const LEVEL_TYPES = [
  'word_search',
  'doors',
  'this_or_that',
  'highlight_words',
  'loot_chest',
  'match_pairs',
  'sort_order',
  'bucket_toss',
  'fill_the_rune',
  'riddle',
  'spot_the_bug',
  'boss',
] as const;

export type LevelType = (typeof LEVEL_TYPES)[number];

export type LevelStatus = 'pending' | 'answered' | 'steered' | 'superseded';

export interface LevelEnvelope {
  id: string;
  type: LevelType;
  /** The underlying spec question, shown to the player. */
  prompt: string;
  payload: unknown;
  status: LevelStatus;
  createdAt: number;
  answeredAt?: number;
  answer?: unknown;
  steerText?: string;
  steerCount: number;
  resetCount: number;
  points?: number;
}

interface Item {
  id: string;
  label: string;
  description?: string;
}

const isString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isArray = (v: unknown): v is unknown[] => Array.isArray(v) && v.length > 0;
const isItem = (v: unknown): v is Item =>
  !!v && typeof v === 'object' && isString((v as Item).id) && isString((v as Item).label);
const allItems = (v: unknown): v is Item[] => isArray(v) && v.every(isItem);

type Validator = (payload: Record<string, unknown>) => string | null;

/** Payload validators per level type. Return an error message or null when valid. */
const payloadValidators: Record<LevelType, Validator> = {
  // options: candidate answer words. The server generates the grid.
  word_search: (p) =>
    isArray(p.options) && p.options.every((o) => isString(o) && (o as string).length <= 12)
      ? null
      : 'word_search needs options: string[] (each 1-12 chars)',
  doors: (p) =>
    allItems(p.options) && (p.options as Item[]).length >= 2 && (p.options as Item[]).length <= 4
      ? null
      : 'doors needs options: 2-4 items {id,label,description?}',
  this_or_that: (p) =>
    isArray(p.items) &&
    p.items.every(
      (index) =>
        !!index &&
        typeof index === 'object' &&
        isString((index as { id: unknown }).id) &&
        isString((index as { prompt: unknown }).prompt) &&
        isString((index as { left: unknown }).left) &&
        isString((index as { right: unknown }).right)
    )
      ? null
      : 'this_or_that needs items: {id,prompt,left,right}[]',
  highlight_words: (p) => (allItems(p.items) ? null : 'highlight_words needs items: {id,label}[] (the tappable parts)'),
  loot_chest: (p) => (allItems(p.items) ? null : 'loot_chest needs items: {id,label,description?}[]'),
  match_pairs: (p) => (allItems(p.left) && allItems(p.right) ? null : 'match_pairs needs left and right: {id,label}[]'),
  sort_order: (p) => (allItems(p.items) ? null : 'sort_order needs items: {id,label}[]'),
  bucket_toss: (p) =>
    allItems(p.buckets) && allItems(p.items) ? null : 'bucket_toss needs buckets: {id,label}[] and items: {id,label}[]',
  fill_the_rune: (p) =>
    isString(p.template) && (p.template as string).includes('___')
      ? null
      : 'fill_the_rune needs template: string containing ___',
  riddle: (p) => (isString(p.question) ? null : 'riddle needs question: string'),
  spot_the_bug: (p) => (allItems(p.spans) ? null : 'spot_the_bug needs spans: {id,label}[] (fragments, one flawed)'),
  boss: (p) =>
    isArray(p.findings) &&
    p.findings.every(
      (f) => !!f && typeof f === 'object' && isString((f as Item).id) && isString((f as { text: unknown }).text)
    )
      ? null
      : 'boss needs findings: {id,text}[]',
};

/** Answer validators per level type. */
const answerValidators: Record<LevelType, Validator> = {
  word_search: (a) => (isString(a.selected) ? null : 'answer needs selected: string'),
  doors: (a) => (isString(a.chosenId) ? null : 'answer needs chosenId: string'),
  this_or_that: (a) =>
    isArray(a.choices) &&
    a.choices.every(
      (c) =>
        !!c &&
        typeof c === 'object' &&
        isString((c as { id: unknown }).id) &&
        ['left', 'right'].includes((c as { side: string }).side)
    )
      ? null
      : 'answer needs choices: {id, side: left|right}[]',
  highlight_words: (a) =>
    Array.isArray(a.selectedIds) && (a.selectedIds as unknown[]).every(isString)
      ? null
      : 'answer needs selectedIds: string[]',
  loot_chest: (a) =>
    Array.isArray(a.selectedIds) && (a.selectedIds as unknown[]).every(isString)
      ? null
      : 'answer needs selectedIds: string[]',
  match_pairs: (a) =>
    isArray(a.pairs) &&
    a.pairs.every(
      (p) =>
        !!p &&
        typeof p === 'object' &&
        isString((p as { leftId: unknown }).leftId) &&
        isString((p as { rightId: unknown }).rightId)
    )
      ? null
      : 'answer needs pairs: {leftId,rightId}[]',
  sort_order: (a) =>
    isArray(a.orderedIds) && (a.orderedIds as unknown[]).every(isString) ? null : 'answer needs orderedIds: string[]',
  bucket_toss: (a) =>
    isArray(a.placements) &&
    a.placements.every(
      (p) =>
        !!p &&
        typeof p === 'object' &&
        isString((p as { itemId: unknown }).itemId) &&
        isString((p as { bucketId: unknown }).bucketId)
    )
      ? null
      : 'answer needs placements: {itemId,bucketId}[]',
  fill_the_rune: (a) => (isString(a.value) ? null : 'answer needs value: string'),
  riddle: (a) => (isString(a.text) ? null : 'answer needs text: string'),
  spot_the_bug: (a) => (isString(a.selectedId) ? null : 'answer needs selectedId: string, note?: string'),
  boss: (a) =>
    isArray(a.resolutions) &&
    a.resolutions.every(
      (r) =>
        !!r &&
        typeof r === 'object' &&
        isString((r as Item).id) &&
        ['accept', 'reject', 'correct'].includes((r as { action: string }).action)
    )
      ? null
      : 'answer needs resolutions: {id, action: accept|reject|correct, correction?}[]',
};

export function validatePayload(type: LevelType, payload: unknown): string | null {
  if (!LEVEL_TYPES.includes(type)) return `unknown level type: ${type}`;
  if (!payload || typeof payload !== 'object') return 'payload must be an object';
  return payloadValidators[type](payload as Record<string, unknown>);
}

export function validateAnswer(type: LevelType, answer: unknown): string | null {
  if (!answer || typeof answer !== 'object') return 'answer must be an object';
  return answerValidators[type](answer as Record<string, unknown>);
}
