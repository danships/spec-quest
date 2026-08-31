import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { SuperSave, type BaseEntity, type Repository } from 'supersave';

export interface RelayState {
  protocolVersion: string;
  session: Record<string, unknown> | null;
  level: Record<string, unknown> | null;
}

interface RelayEntity extends BaseEntity {
  id: string;
  ownerId: string;
  tokenHash: string;
  stateJson: string;
  createdAt: number;
  updatedAt: number;
}

export type RelayActionType = 'answer' | 'steer' | 'reset';

interface RelayActionEntity extends BaseEntity {
  id: string;
  relayId: string;
  levelId: string;
  type: RelayActionType;
  payloadJson: string;
  createdAt: number;
}

export interface RelayAction {
  id: string;
  levelId: string;
  type: RelayActionType;
  payload: Record<string, unknown>;
}

const emptyState: RelayState = { protocolVersion: '1.0.0', session: null, level: null };

function ensureSqliteDirectory(connection: string): void {
  if (!connection.startsWith('sqlite://')) return;
  const filename = connection.slice('sqlite://'.length);
  if (filename === ':memory:') return;
  mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
}

export function hashRelayToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function relayTokenMatches(token: string, hash: string): boolean {
  const received = Buffer.from(hashRelayToken(token), 'hex');
  const expected = Buffer.from(hash, 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export class RelayStore {
  private constructor(
    private readonly superSave: SuperSave,
    private readonly relays: Repository<RelayEntity>,
    private readonly actions: Repository<RelayActionEntity>
  ) {}

  static async create(connection: string): Promise<RelayStore> {
    ensureSqliteDirectory(connection);
    const superSave = await SuperSave.create(connection);
    const relays = await superSave.addEntity<RelayEntity>({
      name: 'spec_quest_relay',
      template: {
        ownerId: '',
        tokenHash: '',
        stateJson: '',
        createdAt: 0,
        updatedAt: 0,
      },
      relations: [],
      filterSortFields: { ownerId: 'string', updatedAt: 'number' },
    });
    const actions = await superSave.addEntity<RelayActionEntity>({
      name: 'spec_quest_relay_action',
      template: {
        relayId: '',
        levelId: '',
        type: '',
        payloadJson: '',
        createdAt: 0,
      },
      relations: [],
      filterSortFields: { relayId: 'string', createdAt: 'number' },
    });
    return new RelayStore(superSave, relays, actions);
  }

  async createRelay(ownerId: string): Promise<{ relay: RelayEntity; token: string }> {
    const token = randomBytes(32).toString('base64url');
    const now = Date.now();
    const relay = await this.relays.create({
      ownerId,
      tokenHash: hashRelayToken(token),
      stateJson: JSON.stringify(emptyState),
      createdAt: now,
      updatedAt: now,
    });
    return { relay, token };
  }

  getRelay(id: string): Promise<RelayEntity | null> {
    return this.relays.getById(id);
  }

  getLatestRelay(ownerId: string): Promise<RelayEntity | null> {
    return this.relays.getOneByQuery(
      this.relays.createQuery().eq('ownerId', ownerId).sort('updatedAt', 'desc').limit(1)
    );
  }

  async updateState(relay: RelayEntity, state: RelayState): Promise<RelayEntity> {
    return this.relays.update({ ...relay, stateJson: JSON.stringify(state), updatedAt: Date.now() });
  }

  parseState(relay: RelayEntity): RelayState {
    return JSON.parse(relay.stateJson) as RelayState;
  }

  async enqueueAction(
    relayId: string,
    levelId: string,
    type: RelayActionType,
    payload: Record<string, unknown>
  ): Promise<RelayAction> {
    const action = await this.actions.create({
      relayId,
      levelId,
      type,
      payloadJson: JSON.stringify(payload),
      createdAt: Date.now(),
    });
    return { id: action.id, levelId, type, payload };
  }

  async nextAction(relayId: string): Promise<RelayAction | null> {
    const action = await this.actions.getOneByQuery(
      this.actions.createQuery().eq('relayId', relayId).sort('createdAt', 'asc').limit(1)
    );
    return action
      ? {
          id: action.id,
          levelId: action.levelId,
          type: action.type,
          payload: JSON.parse(action.payloadJson) as Record<string, unknown>,
        }
      : null;
  }

  async acknowledgeAction(relayId: string, actionId: string): Promise<boolean> {
    const action = await this.actions.getById(actionId);
    if (!action || action.relayId !== relayId) return false;
    await this.actions.deleteUsingId(actionId);
    return true;
  }

  close(): Promise<void> {
    return this.superSave.close();
  }
}
