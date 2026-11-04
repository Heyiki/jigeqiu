import type { SearchEngine } from '../../types';

export const SYSTEM_COMMANDS = [
  { id: 'all', title: 'commandAllTitle', description: 'commandAllDescription' },
  { id: 'setting', title: 'commandSettingTitle', description: 'commandAppearanceDescription' },
  { id: 'add', title: 'commandAddTitle', description: 'commandAddDescription' },
  { id: 'search', title: 'commandSearchTitle', description: 'commandSearchDescription' },
  { id: 'start', title: 'commandStartTitle', description: 'commandStartDescription' },
  { id: 'trash', title: 'commandTrashTitle', description: 'commandTrashDescription' },
  { id: 'theme', title: 'commandThemeTitle', description: 'commandAppearanceDescription' },
  { id: 'dark', title: 'commandDarkTitle', description: 'commandDarkDescription' },
  { id: 'light', title: 'commandLightTitle', description: 'commandLightDescription' },
  { id: 'help', title: 'commandHelpTitle', description: 'commandHelpDescription' },
] as const;

export type SystemCommandId = typeof SYSTEM_COMMANDS[number]['id'];
export type CommandMatch =
  | { kind: 'system'; command: typeof SYSTEM_COMMANDS[number] }
  | { kind: 'engine'; engine: SearchEngine; query: string };

export function matchSpotlightCommands(input: string, engines: SearchEngine[]): CommandMatch[] {
  const match = /^\/([^\s]*)(?:\s+([\s\S]*))?$/.exec(input.trim());
  if (!match) return [];
  const keyword = match[1].toLowerCase();
  const query = (match[2] ?? '').trim();
  const systems: CommandMatch[] = query ? [] : SYSTEM_COMMANDS
    .filter(command => command.id.startsWith(keyword))
    .map(command => ({ kind: 'system', command }));
  const matches: CommandMatch[] = engines
    .filter(engine => engine.isEnabled !== false && (query
      ? engine.keyword.toLowerCase() === keyword
      : engine.keyword.toLowerCase().startsWith(keyword)))
    .map(engine => ({ kind: 'engine', engine, query }));
  const exact = (item: CommandMatch) =>
    (item.kind === 'system' ? item.command.id : item.engine.keyword.toLowerCase()) === keyword;
  return [...systems, ...matches].sort((a, b) => Number(exact(b)) - Number(exact(a)));
}

export function isDesktopSearchKey(event: {
  key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean;
  repeat: boolean; isComposing: boolean; keyCode: number;
}): boolean {
  return (event.key === '/' || event.key === '、') && !event.ctrlKey && !event.metaKey
    && !event.altKey && !event.shiftKey && !event.repeat && !event.isComposing && event.keyCode !== 229;
}
