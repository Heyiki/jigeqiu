import type { SearchEnginePreset } from '../data/search-engine-presets';
import type { SearchEngine } from '../types';

function templateIdentity(template: string): string {
  try {
    const url = new URL(template);
    url.hostname = url.hostname.replace(/^www\./, '');
    url.searchParams.sort();
    return url.href;
  } catch {
    return template.trim();
  }
}

export function searchEnginePresetStatus(
  preset: SearchEnginePreset, engines: readonly SearchEngine[],
): 'added' | 'conflict' | 'available' {
  if (engines.some(engine => engine.id === preset.id
    || templateIdentity(engine.urlTemplate) === templateIdentity(preset.urlTemplate))) return 'added';
  if (engines.some(engine => engine.keyword.trim().replace(/^\//, '').toLowerCase() === preset.keyword)) {
    return 'conflict';
  }
  return 'available';
}
