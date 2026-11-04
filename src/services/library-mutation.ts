/** The command owns persistence; the notification may only read and publish state. */
export function commitAndRefresh<T>(commit: () => T, refresh?: () => void): T {
  const result = commit();
  try {
    refresh?.();
  } catch {
    // Persistence already succeeded; do not tell callers to retry an unsaved command.
    throw new Error('COMMIT_UNCERTAIN');
  }
  return result;
}
