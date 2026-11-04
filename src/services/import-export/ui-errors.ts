import { createTranslator } from '../../i18n';

export function describeAssetError(code: string, language?: string, format: 'chrome' | 'json' = 'chrome'): string {
  const t = createTranslator(language);
  if (format === 'json') {
    switch (code) {
      case 'UNSUPPORTED_VERSION': return t('jsonErrorVersion');
      case 'LEGACY_REQUIRES_PREVIEW': return t('jsonErrorLegacy');
      case 'IMPORT_INVALID': return t('jsonErrorInvalid');
      case 'STORAGE_UNAVAILABLE': return t('jsonErrorRead');
      case 'STORAGE_WRITE_FAILED': return t('jsonErrorWrite');
    }
  }
  switch (code) {
    case 'QUOTA_EXCEEDED': return t('assetErrorQuota');
    case 'PREVIEW_STALE':
    case 'CONFLICT': return t('assetErrorConflict');
    case 'CORRUPT_DATA': return t('assetErrorCorrupt');
    case 'UNSUPPORTED_VERSION': return t('assetErrorVersion');
    case 'LOCK_UNAVAILABLE': return t('assetErrorLock');
    case 'LEGACY_REQUIRES_PREVIEW': return t('assetErrorLegacy');
    case 'IMPORT_TOO_LARGE': return t('assetErrorTooLarge');
    case 'IMPORT_INVALID': return t('assetErrorInvalid');
    case 'COMMIT_UNCERTAIN': return t('assetErrorUncertain');
    default: return t('assetErrorDefault', { code });
  }
}
