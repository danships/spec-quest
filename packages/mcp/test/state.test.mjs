import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

process.env.SPECQUEST_DIR = mkdtempSync(path.join(tmpdir(), 'specquest-state-'));
const state = await import('../dist/state.js');
const { generateGrid } = await import('../dist/wordsearch.js');
const { validatePayload } = await import('../dist/protocol.js');

test('word-search options are playable and every normalized word is in the grid', () => {
  assert.equal(validatePayload('word_search', { options: ['offline', 'server-win', 'manual'] }), null);
  assert.match(validatePayload('word_search', { options: ['🔥', 'valid'] }), /normalize/);
  assert.match(validatePayload('word_search', { options: ['same', 'SAME'] }), /distinct/);

  const options = ['offline', 'server-win', 'manual'];
  const rows = generateGrid(options).map((row) => row.join(''));
  for (const option of options) {
    const normalized = option.toUpperCase().replaceAll(/[^A-Z]/g, '');
    assert.ok(
      rows.some((row) => row.includes(normalized)),
      `${normalized} was missing from the grid`
    );
  }
});

test('answers must reference the actual level and answered levels cannot be replayed', () => {
  state.startSession({ title: 'Offline action queue' });
  const level = state.createLevel('doors', 'How are sync conflicts resolved?', {
    options: [
      { id: 'server', label: 'Server wins' },
      { id: 'manual', label: 'Manual resolution' },
    ],
  });

  assert.throws(() => state.answerLevel(level.id, { chosenId: 'unknown' }), /reference a level option/);
  state.answerLevel(level.id, { chosenId: 'manual' });
  const score = state.getSession().totalScore;
  assert.throws(() => state.resetLevel(level.id), /answered, not open/);
  assert.throws(() => state.answerLevel(level.id, { chosenId: 'server' }), /answered, not open/);
  assert.equal(state.getSession().totalScore, score);
});

test('boss resolutions are complete and corrections contain text', () => {
  state.startSession({ title: 'Offline action queue review' });
  const boss = state.createLevel('boss', 'Resolve the review findings', {
    findings: [
      { id: 'retry', text: 'Requirements: cap retries at five attempts.' },
      { id: 'conflict', text: 'Edge cases: define delete/update conflict handling.' },
    ],
  });

  assert.throws(
    () => state.answerLevel(boss.id, { resolutions: [{ id: 'retry', action: 'accept' }] }),
    /each level item exactly once/
  );
  assert.throws(
    () =>
      state.answerLevel(boss.id, {
        resolutions: [
          { id: 'retry', action: 'correct' },
          { id: 'conflict', action: 'reject' },
        ],
      }),
    /correction text/
  );
  state.answerLevel(boss.id, {
    resolutions: [
      { id: 'retry', action: 'correct', correction: 'Use exponential backoff with five attempts.' },
      { id: 'conflict', action: 'accept' },
    ],
  });
});

test('finish requires a completed boss, rejects open work, and closes the session', () => {
  state.startSession({ title: 'Lifecycle' });
  assert.throws(() => state.finishSession('specs/offline-action-queue.md'), /answered boss/);

  const boss = state.createLevel('boss', 'Confirm the clean review', { findings: [] });
  assert.throws(() => state.finishSession(), /still open/);
  state.answerLevel(boss.id, { resolutions: [] });

  const postReview = state.createLevel('doors', 'A correction raised a new decision.', {
    options: [
      { id: 'keep', label: 'Keep it' },
      { id: 'change', label: 'Change it' },
    ],
  });
  state.answerLevel(postReview.id, { chosenId: 'keep' });
  assert.throws(() => state.finishSession(), /final answered boss/);

  const finalBoss = state.createLevel('boss', 'Revalidate the changed draft', { findings: [] });
  state.answerLevel(finalBoss.id, { resolutions: [] });
  state.finishSession('specs/offline-action-queue.md');

  assert.throws(() => state.finishSession(), /already finished/);
  assert.throws(() => state.createLevel('riddle', 'Late question', { question: 'Too late?' }), /already finished/);
  assert.throws(() => state.steerLevel(boss.id, 'Reopen'), /already finished/);
  assert.throws(() => state.resetLevel(boss.id), /already finished/);
});
