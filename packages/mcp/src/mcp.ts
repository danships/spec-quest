import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { PROTOCOL_VERSION, LEVEL_TYPES, type LevelType } from './protocol.js';
import * as state from './state.js';

const text = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
});

export function buildMcpServer(): McpServer {
  const server = new McpServer({ name: 'spec-quest', version: '0.1.0' });

  server.registerTool(
    'specquest_info',
    {
      description:
        'Returns the protocol version, supported level types, and current session state. ' +
        'Call this first and verify the protocol version matches the skill.',
      inputSchema: {},
    },
    async () =>
      text({
        protocolVersion: PROTOCOL_VERSION,
        levelTypes: LEVEL_TYPES,
        session: state.getSession()
          ? { id: state.getSession()!.id, title: state.getSession()!.title, ...state.stats() }
          : null,
      })
  );

  server.registerTool(
    'specquest_start_session',
    {
      description: 'Start a new Spec Quest session. Supersedes any previous session.',
      inputSchema: {
        title: z.string().min(1).describe('Short title of the feature or spec being worked on'),
        skillVersion: z.string().optional().describe('Version of the Spec Quest skill in use'),
        agentModel: z.string().optional().describe('Model identifier of the agent, for the run metadata'),
      },
    },
    async ({ title, skillVersion, agentModel }) =>
      text({ sessionId: state.startSession({ title, skillVersion, agentModel }).id })
  );

  server.registerTool(
    'specquest_create_level',
    {
      description:
        'Present one open spec question to the developer as a game level. ' +
        'Supersedes any level that is still open. For word_search, pass options only; the grid is generated server side. ' +
        'Payload shape per type: word_search {options: string[]}; doors {options: {id,label,description?}[] (2-4)}; ' +
        'this_or_that {items: {id,prompt,left,right}[]}; highlight_words {items: {id,label}[]}; ' +
        'loot_chest {items: {id,label,description?}[]}; match_pairs {left: {id,label}[], right: {id,label}[]}; ' +
        'sort_order {items: {id,label}[]}; bucket_toss {buckets: {id,label}[], items: {id,label}[]}; ' +
        'fill_the_rune {template: string with ___, hint?: string}; riddle {question: string}; ' +
        'spot_the_bug {spans: {id,label}[]}; boss {findings: {id,text}[]}.',
      inputSchema: {
        type: z.enum(LEVEL_TYPES).describe('Level type'),
        prompt: z.string().min(1).describe('The underlying spec question, shown to the player'),
        payload: z.record(z.unknown()).describe('Type-specific payload, see the description'),
      },
    },
    async ({ type, prompt, payload }) => {
      const level = state.createLevel(type as LevelType, prompt, payload);
      return text({ levelId: level.id, status: level.status });
    }
  );

  server.registerTool(
    'specquest_check_level',
    {
      description:
        'Wait for the developer to act on a level. Long-polls up to 25 seconds. ' +
        'Returns status pending (call again), answered (with answer and points), ' +
        'or steered (with steerText: adjust the question and create a new level, or answer the steer).',
      inputSchema: { levelId: z.string() },
    },
    async ({ levelId }) => {
      const deadline = Date.now() + 25_000;
      for (;;) {
        const level = state.getSession()?.levels.find((l) => l.id === levelId);
        if (!level) return text({ error: `unknown level: ${levelId}` });
        if (level.status === 'answered')
          return text({
            status: 'answered',
            answer: level.answer,
            points: level.points,
            steerCount: level.steerCount,
            resetCount: level.resetCount,
          });
        if (level.status === 'steered') return text({ status: 'steered', steerText: level.steerText });
        if (level.status === 'superseded') return text({ status: 'superseded' });
        const remaining = deadline - Date.now();
        if (remaining <= 0) return text({ status: 'pending' });
        await state.onChange(Math.min(remaining, 5000));
      }
    }
  );

  server.registerTool(
    'specquest_finish_session',
    {
      description: 'Finish the session after the boss level. Returns the final score summary.',
      inputSchema: {
        specPath: z.string().optional().describe('Path of the generated spec file'),
      },
    },
    async ({ specPath }) => {
      const session = state.finishSession(specPath);
      return text({
        sessionId: session.id,
        totalScore: session.totalScore,
        ...state.stats(),
        skillVersion: session.skillVersion,
        agentModel: session.agentModel,
        protocolVersion: session.protocolVersion,
      });
    }
  );

  return server;
}
