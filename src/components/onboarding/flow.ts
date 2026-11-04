import type { OnboardingEntry, OnboardingTask } from './types';

export interface Flow {
  phase: 'idle' | 'welcome' | 'tour' | 'taskPicker' | 'task' | 'result';
  task?: OnboardingTask;
  bookmarkId?: string;
}
export type FlowEvent =
  | { type: 'welcome' }
  | { type: 'start'; entry: OnboardingEntry; hasBookmarks: boolean }
  | { type: 'exit' }
  | { type: 'tour-complete' }
  | { type: 'success'; task: OnboardingTask; bookmarkId?: string };
export const initialFlow: Flow = { phase: 'idle' };

export function transition(state: Flow, event: FlowEvent): Flow {
  switch (event.type) {
    case 'welcome': return state.phase === 'idle' ? { phase: 'welcome' } : state;
    case 'exit': return initialFlow;
    case 'start':
      if (event.entry === 'tour') return { phase: 'tour' };
      if (event.entry === 'pin' && !event.hasBookmarks) return { phase: 'taskPicker' };
      return { phase: 'task', task: event.entry };
    case 'tour-complete': return state.phase === 'tour' ? { phase: 'taskPicker' } : state;
    case 'success':
      return state.phase === 'task' && state.task === event.task
        ? { phase: 'result', task: event.task, bookmarkId: event.bookmarkId } : state;
  }
}
