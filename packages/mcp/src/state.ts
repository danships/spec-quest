import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import {
  PROTOCOL_VERSION,
  type LevelEnvelope,
  type LevelType,
  validateAnswerForPayload,
  validatePayload,
} from './protocol.js';
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

export interface SpecQuestStateOptions {
  /** A null directory creates an in-memory store. Undefined uses .specquest in the current directory. */
  stateDir?: string | null;
}

/** An isolated session store that can be injected into the app and MCP server. */
export class SpecQuestState {
  readonly #stateDir: string | null;
  #session: Session | null = null;
  readonly #waiters = new Set<() => void>();

  constructor(options: SpecQuestStateOptions = {}) {
    this.#stateDir = options.stateDir === undefined ? path.join(process.cwd(), '.specquest') : options.stateDir;
  }

  /** Wakes every pending long-poll (agent waiting for an answer, web app waiting for a level). */
  #notify(): void {
    for (const waiter of this.#waiters) waiter();
    this.#waiters.clear();
  }

  onChange(timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.#waiters.delete(wake);
        resolve();
      }, timeoutMs);
      const wake = () => {
        clearTimeout(timer);
        resolve();
      };
      this.#waiters.add(wake);
    });
  }

  #persist(): void {
    if (!this.#session || !this.#stateDir) return;
    mkdirSync(this.#stateDir, { recursive: true });
    writeFileSync(
      path.join(this.#stateDir, `session-${this.#session.id}.json`),
      JSON.stringify(this.#session, null, 2)
    );
    writeFileSync(path.join(this.#stateDir, 'current.json'), JSON.stringify({ id: this.#session.id }));
  }

  /** Restore the last session on server restart, so a crash does not lose the run. */
  restore(): void {
    if (!this.#stateDir) return;
    const pointer = path.join(this.#stateDir, 'current.json');
    if (!existsSync(pointer)) return;
    try {
      const { id } = JSON.parse(readFileSync(pointer, 'utf8')) as { id: string };
      const file = path.join(this.#stateDir, `session-${id}.json`);
      if (existsSync(file)) this.#session = JSON.parse(readFileSync(file, 'utf8')) as Session;
    } catch {
      // PoC shortcut: unreadable state is ignored, a new session starts clean.
    }
  }

  getSession(): Session | null {
    return this.#session;
  }

  startSession(input: { title: string; skillVersion?: string; agentModel?: string }): Session {
    this.#session = {
      id: randomUUID().slice(0, 8),
      title: input.title,
      protocolVersion: PROTOCOL_VERSION,
      skillVersion: input.skillVersion,
      agentModel: input.agentModel,
      createdAt: Date.now(),
      levels: [],
      totalScore: 0,
    };
    this.#persist();
    this.#notify();
    return this.#session;
  }

  createLevel(type: LevelType, prompt: string, payload: unknown): LevelEnvelope {
    if (!this.#session) throw new Error('no active session, call specquest_start_session first');
    if (this.#session.finishedAt) throw new Error('session is already finished');
    const error = validatePayload(type, payload);
    if (error) throw new Error(`invalid payload: ${error}`);
    // Any still-open level is superseded: the game shows one level at a time.
    for (const level of this.#session.levels) {
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
    this.#session.levels.push(level);
    this.#persist();
    this.#notify();
    return level;
  }

  #findLevel(levelId: string): LevelEnvelope {
    const level = this.#session?.levels.find((candidate) => candidate.id === levelId);
    if (!level) throw new Error(`unknown level: ${levelId}`);
    return level;
  }

  answerLevel(levelId: string, answer: unknown): LevelEnvelope {
    if (this.#session?.finishedAt) throw new Error('session is already finished');
    const level = this.#findLevel(levelId);
    if (level.status !== 'pending') throw new Error(`level ${levelId} is ${level.status}, not open`);
    const error = validateAnswerForPayload(level.type, answer, level.payload);
    if (error) throw new Error(`invalid answer: ${error}`);
    const now = Date.now();
    level.answer = answer;
    level.answeredAt = now;
    level.status = 'answered';
    level.points = scoreLevel(level, now);
    this.#session!.totalScore += level.points;
    this.#persist();
    this.#notify();
    return level;
  }

  steerLevel(levelId: string, text: string): LevelEnvelope {
    if (this.#session?.finishedAt) throw new Error('session is already finished');
    const level = this.#findLevel(levelId);
    if (level.status !== 'pending') throw new Error(`level ${levelId} is ${level.status}, not open`);
    level.steerText = text;
    level.steerCount += 1;
    level.status = 'steered';
    this.#persist();
    this.#notify();
    return level;
  }

  resetLevel(levelId: string): LevelEnvelope {
    if (this.#session?.finishedAt) throw new Error('session is already finished');
    const level = this.#findLevel(levelId);
    if (level.status !== 'pending' && level.status !== 'steered')
      throw new Error(`level ${levelId} is ${level.status}, not open`);
    level.resetCount += 1;
    level.steerText = undefined;
    level.status = 'pending';
    level.createdAt = Date.now(); // the time bonus window restarts with the level
    this.#persist();
    this.#notify();
    return level;
  }

  finishSession(specPath?: string): Session {
    if (!this.#session) throw new Error('no active session');
    if (this.#session.finishedAt) throw new Error('session is already finished');
    if (this.#session.levels.some((level) => level.status === 'pending' || level.status === 'steered'))
      throw new Error('cannot finish while a level is still open');
    let lastAnswered: LevelEnvelope | undefined;
    for (const level of this.#session.levels) {
      if (level.status === 'answered') lastAnswered = level;
    }
    if (lastAnswered?.type !== 'boss') throw new Error('cannot finish before a final answered boss review');
    this.#session.finishedAt = Date.now();
    this.#session.specPath = specPath;
    this.#persist();
    this.#notify();
    return this.#session;
  }

  /** The level the web app should render: the newest open one. */
  currentLevel(): LevelEnvelope | null {
    if (!this.#session) return null;
    for (let index = this.#session.levels.length - 1; index >= 0; index--) {
      const level = this.#session.levels[index];
      if (level.status === 'pending' || level.status === 'steered') return level;
    }
    return null;
  }

  stats(): { answered: number; steers: number; resets: number } {
    const levels = this.#session?.levels ?? [];
    return {
      answered: levels.filter((level) => level.status === 'answered').length,
      steers: levels.reduce((count, level) => count + level.steerCount, 0),
      resets: levels.reduce((count, level) => count + level.resetCount, 0),
    };
  }
}
