import { createTranslator } from '../i18n';

export function preferenceSaveError(
  cause: unknown, language?: string, scope: 'settings' | 'library' = 'settings',
): string {
  const t = createTranslator(language);
  const code = typeof cause === 'object' && cause !== null && 'code' in cause && typeof cause.code === 'string'
    ? cause.code : cause instanceof Error ? cause.message : '';
  const name = cause instanceof Error ? cause.name : '';
  if (scope === 'library') {
    if (code === 'COMMIT_UNCERTAIN') {
      return t('libraryUncertain');
    }
    if (name === 'QuotaExceededError' || code === 'QUOTA_EXCEEDED') {
      return t('libraryQuota');
    }
    if (name === 'SecurityError' || code === 'SecurityError' || code === 'STORAGE_UNAVAILABLE') {
      return t('libraryUnavailable');
    }
    if (code === 'CONFLICT') {
      return t('libraryConflict');
    }
    if (code === 'LOCK_UNAVAILABLE') {
      return t('libraryLockUnavailable');
    }
    if (code === 'INVALID_REFERENCE') {
      return t('libraryInvalidReference');
    }
    return t('librarySaveFailed');
  }
  if (code === 'COMMIT_UNCERTAIN') {
    return t('settingsUncertain');
  }
  if (name === 'QuotaExceededError' || code === 'QUOTA_EXCEEDED') {
    return t('settingsQuota');
  }
  if (name === 'SecurityError' || code === 'SecurityError' || code === 'STORAGE_UNAVAILABLE') {
    return t('settingsUnavailable');
  }
  if (code === 'CONFLICT') {
    return t('settingsConflict');
  }
  if (code === 'LOCK_UNAVAILABLE') {
    return t('presetLockUnavailable');
  }
  return t('settingsSaveFailed');
}
