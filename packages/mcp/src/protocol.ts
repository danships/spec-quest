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
const allItems = (v: unknown): v is Item[] =>
  isArray(v) && v.every(isItem) && new Set(v.map((item) => (item as Item).id)).size === v.length;
const ids = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((item) => (item as { id: string }).id) : [];

function exactIds(actual: string[], expected: string[], label: string): string | null {
  if (new Set(actual).size !== actual.length) return `${label} contains duplicate ids`;
  if (actual.length !== expected.length || actual.some((id) => !expected.includes(id)))
    return `${label} must contain each level item exactly once`;
  return null;
}

type Validator = (payload: Record<string, unknown>) => string | null;

/** Payload validators per level type. Return an error message or null when valid. */
const payloadValidators: Record<LevelType, Validator> = {
  // options: candidate answer words. The server generates the grid.
  word_search: (p) => {
    if (!Array.isArray(p.options) || p.options.length < 2 || p.options.length > 8)
      return 'word_search needs options: 2-8 strings';
    const words = p.options.map((option) =>
      typeof option === 'string' ? option.toUpperCase().replaceAll(/[^A-Z]/g, '') : ''
    );
    return words.every((word) => word.length > 0 && word.length <= 12) && new Set(words).size === words.length
      ? null
      : 'word_search options must be distinct and normalize to 1-12 A-Z letters';
  },
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
    Array.isArray(p.findings) &&
    p.findings.every(
      (f) => !!f && typeof f === 'object' && isString((f as Item).id) && isString((f as { text: unknown }).text)
    ) &&
    new Set(p.findings.map((finding) => (finding as Item).id)).size === p.findings.length
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
    Array.isArray(a.resolutions) &&
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

/** Validate answer values against the level payload, not only their JSON shape. */
export function validateAnswerForPayload(type: LevelType, answer: unknown, payload: unknown): string | null {
  const shapeError = validateAnswer(type, answer);
  if (shapeError) return shapeError;
  if (!payload || typeof payload !== 'object') return 'level payload must be an object';

  const a = answer as Record<string, unknown>;
  const p = payload as Record<string, unknown>;
  const selectedIds = (a.selectedIds as string[]) ?? [];

  switch (type) {
    case 'word_search': {
      return (p.options as string[]).includes(a.selected as string)
        ? null
        : 'selected must be one of the level options';
    }
    case 'doors': {
      return ids(p.options).includes(a.chosenId as string) ? null : 'chosenId must reference a level option';
    }
    case 'this_or_that': {
      return exactIds(
        (a.choices as { id: string }[]).map((choice) => choice.id),
        ids(p.items),
        'choices'
      );
    }
    case 'highlight_words':
    case 'loot_chest': {
      if (new Set(selectedIds).size !== selectedIds.length) return 'selectedIds contains duplicate ids';
      return selectedIds.every((id) => ids(p.items).includes(id)) ? null : 'selectedIds must reference level items';
    }
    case 'match_pairs': {
      const pairs = a.pairs as { leftId: string; rightId: string }[];
      const leftError = exactIds(
        pairs.map((pair) => pair.leftId),
        ids(p.left),
        'pairs.leftId'
      );
      if (leftError) return leftError;
      return pairs.every((pair) => ids(p.right).includes(pair.rightId))
        ? null
        : 'pairs.rightId must reference a right-side level item';
    }
    case 'sort_order': {
      return exactIds(a.orderedIds as string[], ids(p.items), 'orderedIds');
    }
    case 'bucket_toss': {
      const placements = a.placements as { itemId: string; bucketId: string }[];
      const itemError = exactIds(
        placements.map((placement) => placement.itemId),
        ids(p.items),
        'placements.itemId'
      );
      if (itemError) return itemError;
      return placements.every((placement) => ids(p.buckets).includes(placement.bucketId))
        ? null
        : 'placements.bucketId must reference a level bucket';
    }
    case 'spot_the_bug': {
      return ids(p.spans).includes(a.selectedId as string) ? null : 'selectedId must reference a level span';
    }
    case 'boss': {
      const resolutions = a.resolutions as { id: string; action: string; correction?: unknown }[];
      const resolutionError = exactIds(
        resolutions.map((resolution) => resolution.id),
        ids(p.findings),
        'resolutions'
      );
      if (resolutionError) return resolutionError;
      return resolutions.some((resolution) => resolution.action === 'correct' && !isString(resolution.correction))
        ? 'correct resolutions need non-empty correction text'
        : null;
    }
    case 'fill_the_rune':
    case 'riddle': {
      return null;
    }
  }
}
