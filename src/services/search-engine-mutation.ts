/** All management-page engine writers share this lock, including preset batches. */
export async function withSearchEngineMutation<T>(action: () => T, isCurrent: () => boolean): Promise<T> {
  if (!isCurrent()) throw new Error('CANCELLED');
  if (!navigator.locks?.request) throw new Error('LOCK_UNAVAILABLE');
  return navigator.locks.request('jigeqiu:prototype:search-engines', () => {
    if (!isCurrent()) throw new Error('CANCELLED');
    return action();
  });
}
