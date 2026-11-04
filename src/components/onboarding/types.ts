export type OnboardingTask = 'import' | 'add' | 'pin';
export type OnboardingEntry = 'tour' | OnboardingTask;
export type OnboardingEvent =
  | { type: 'import-stage'; stage: 'reading' | 'preview' | 'cancel' }
  | { type: 'import-success' }
  | { type: 'add-url'; valid: boolean }
  | { type: 'pin-query'; firstId: string | null; hasQuery: boolean }
  | { type: 'pin-menu'; bookmarkId: string | null };

export interface OnboardingTaskContext {
  task: OnboardingTask;
  onExit(): void;
  onEvent(event: OnboardingEvent): void;
}
