import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PROTOCOL_VERSION, type LevelEnvelope, type LevelType, validatePayload, validateAnswer } from './protocol.js';
import { scoreLevel } from './scoring.js';
import { generateGrid } from './wordsearch.js';

export interface Session {
  id: string;
  title: string;
  protocolVersion: string;
  skillVersion?: string;
  agentModel?: string;
  createdAt: number;
  finishedAt?: number;
  specPath?: string;
  levels: LevelEnvelope[];
  totalScore: number;
}

const STATE_DIR = process.env.SPECQUEST_DIR ?? path.join(process.cwd(), '.specquest');

let session: Session | null = null;
const waiters = new Set<() => void>();
const subscribers = new Set<(snapshot: StateSnapshot) => void>();

export interface StateSnapshot {
  protocolVersion: string;
  session: ({ id: string; title: string; totalScore: number; finished: boolean } & ReturnType<typeof stats>) | null;
  level: LevelEnvelope | null;
}

export interface RemoteAction {
  id: string;
  levelId: string;
  type: 'answer' | 'steer' | 'reset';
  payload: Record<string, unknown>;
}

/** Wakes every pending long-poll (agent waiting for an answer, web app waiting for a level). */
function notify(): void {
  for (const w of waiters) w();
  waiters.clear();
  const current = snapshot();
  for (const subscriber of subscribers) subscriber(current);
}

export function subscribe(subscriber: (snapshot: StateSnapshot) => void): () => void {
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}

export function onChange(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      waiters.delete(wake);
      resolve();
    }, timeoutMs);
    const wake = () => {
      clearTimeout(timer);
      resolve();
    };
    waiters.add(wake);
  });
}

function persist(): void {
  if (!session) return;
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(path.join(STATE_DIR, `session-${session.id}.json`), JSON.stringify(session, null, 2));
  writeFileSync(path.join(STATE_DIR, 'current.json'), JSON.stringify({ id: session.id }));
}

/** Restore the last session on server restart, so a crash does not lose the run. */
export function restore(): void {
  const pointer = path.join(STATE_DIR, 'current.json');
  if (!existsSync(pointer)) return;
  try {
    const { id } = JSON.parse(readFileSync(pointer, 'utf8')) as { id: string };
    const file = path.join(STATE_DIR, `session-${id}.json`);
    if (existsSync(file)) {
      session = JSON.parse(readFileSync(file, 'utf8')) as Session;
      notify();
    }
  } catch {
    // PoC shortcut: unreadable state is ignored, a new session starts clean.
  }
}

export function getSession(): Session | null {
  return session;
}

export function startSession(input: { title: string; skillVersion?: string; agentModel?: string }): Session {
  session = {
    id: randomUUID().slice(0, 8),
    title: input.title,
    protocolVersion: PROTOCOL_VERSION,
    skillVersion: input.skillVersion,
    agentModel: input.agentModel,
    createdAt: Date.now(),
    levels: [],
    totalScore: 0,
  };
  persist();
  notify();
  return session;
}

export function createLevel(type: LevelType, prompt: string, payload: unknown): LevelEnvelope {
  if (!session) throw new Error('no active session, call specquest_start_session first');
  const error = validatePayload(type, payload);
  if (error) throw new Error(`invalid payload: ${error}`);
  // Any still-open level is superseded: the game shows one level at a time.
  for (const level of session.levels) {
    if (level.status === 'pending' || level.status === 'steered') level.status = 'superseded';
  }
  let finalPayload = payload as Record<string, unknown>;
  if (type === 'word_search') {
    finalPayload = { ...finalPayload, grid: generateGrid(finalPayload.options as string[]) };
  }
  const level: LevelEnvelope = {
    id: randomUUID().slice(0, 8),
    type,
    prompt,
    payload: finalPayload,
    status: 'pending',
    createdAt: Date.now(),
    steerCount: 0,
    resetCount: 0,
  };
  session.levels.push(level);
  persist();
  notify();
  return level;
}

function findLevel(levelId: string): LevelEnvelope {
  const level = session?.levels.find((l) => l.id === levelId);
  if (!level) throw new Error(`unknown level: ${levelId}`);
  return level;
}

export function answerLevel(levelId: string, answer: unknown): LevelEnvelope {
  const level = findLevel(levelId);
  if (level.status !== 'pending' && level.status !== 'steered')
    throw new Error(`level ${levelId} is ${level.status}, not open`);
  const error = validateAnswer(level.type, answer);
  if (error) throw new Error(`invalid answer: ${error}`);
  const now = Date.now();
  level.answer = answer;
  level.answeredAt = now;
  level.status = 'answered';
  level.points = scoreLevel(level, now);
  session!.totalScore += level.points;
  persist();
  notify();
  return level;
}

export function steerLevel(levelId: string, text: string): LevelEnvelope {
  const level = findLevel(levelId);
  level.steerText = text;
  level.steerCount += 1;
  level.status = 'steered';
  persist();
  notify();
  return level;
}

export function resetLevel(levelId: string): LevelEnvelope {
  const level = findLevel(levelId);
  level.resetCount += 1;
  level.steerText = undefined;
  level.status = 'pending';
  level.createdAt = Date.now(); // the time bonus window restarts with the level
  persist();
  notify();
  return level;
}

export function finishSession(specPath?: string): Session {
  if (!session) throw new Error('no active session');
  session.finishedAt = Date.now();
  session.specPath = specPath;
  persist();
  notify();
  return session;
}

/** The level the web app should render: the newest open one. */
export function currentLevel(): LevelEnvelope | null {
  if (!session) return null;
  for (let index = session.levels.length - 1; index >= 0; index--) {
    const level = session.levels[index];
    if (level.status === 'pending' || level.status === 'steered') return level;
  }
  return null;
}

export function stats(): { answered: number; steers: number; resets: number } {
  const levels = session?.levels ?? [];
  return {
    answered: levels.filter((l) => l.status === 'answered').length,
    steers: levels.reduce((n, l) => n + l.steerCount, 0),
    resets: levels.reduce((n, l) => n + l.resetCount, 0),
  };
}

export function snapshot(): StateSnapshot {
  return {
    protocolVersion: PROTOCOL_VERSION,
    session: session
      ? {
          id: session.id,
          title: session.title,
          totalScore: session.totalScore,
          finished: !!session.finishedAt,
          ...stats(),
        }
      : null,
    level: currentLevel(),
  };
}

export function applyRemoteAction(action: RemoteAction): void {
  if (action.type === 'answer') {
    answerLevel(action.levelId, action.payload.answer);
    return;
  }
  if (action.type === 'steer') {
    if (typeof action.payload.text !== 'string' || !action.payload.text) throw new Error('remote steer needs text');
    steerLevel(action.levelId, action.payload.text);
    return;
  }
  resetLevel(action.levelId);
}
