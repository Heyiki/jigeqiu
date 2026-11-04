import assert from 'node:assert/strict';
import { test } from 'node:test';
import { transition, initialFlow } from '../../src/components/onboarding/flow';

test('tour completion opens task picker, exiting never completes a task', () => {
  const welcome = transition(initialFlow, { type: 'welcome' });
  assert.equal(welcome.phase, 'welcome');
  const tour = transition(welcome, { type: 'start', entry: 'tour', hasBookmarks: false });
  assert.equal(tour.phase, 'tour');
  assert.equal(transition(tour, { type: 'tour-complete' }).phase, 'taskPicker');
  const add = transition(initialFlow, { type: 'start', entry: 'add', hasBookmarks: false });
  assert.equal(add.task, 'add');
  assert.equal(transition(add, { type: 'exit' }).phase, 'idle');
});

test('empty library cannot start pin task and success is scoped to active task', () => {
  assert.equal(transition(initialFlow, { type: 'start', entry: 'pin', hasBookmarks: false }).phase, 'taskPicker');
  assert.deepEqual(transition(initialFlow, { type: 'success', task: 'add', bookmarkId: 'a' }), initialFlow);
  const add = transition(initialFlow, { type: 'start', entry: 'add', hasBookmarks: false });
  assert.equal(transition(add, { type: 'success', task: 'import' }).phase, 'task');
  const result = transition(add, { type: 'success', task: 'add', bookmarkId: 'a' });
  assert.equal(result.phase, 'result');
  assert.equal(result.bookmarkId, 'a');
});
