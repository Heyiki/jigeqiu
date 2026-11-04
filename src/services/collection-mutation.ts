/** Share the import lock; never let a queued operation outlive its editor session. */
export async function withCollectionMutation<T>(action: () => T, isCurrent: () => boolean): Promise<T> {
  if (!isCurrent()) throw new Error('CANCELLED');
  if (!navigator.locks?.request) throw new Error('LOCK_UNAVAILABLE');
  return navigator.locks.request('jigeqiu:prototype:library-import', () => {
    if (!isCurrent()) throw new Error('CANCELLED');
    return action();
  });
}
