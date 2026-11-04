import React from 'react';
import { Home, Library, Languages, Moon, Sun } from 'lucide-react';
import { createTranslator, resolveLocale } from '../../i18n';

export function TopNavigation({ management, language, dark, onHome, onManagement, onLanguage, onTheme }: {
  management: boolean; language?: string; dark: boolean;
  onHome: () => void; onManagement: () => void; onLanguage: () => void; onTheme: () => void;
}) {
  const t = createTranslator(language);
  const isEnglish = resolveLocale(language) === 'en';
  const iconButton = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-700 outline-none hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-slate-200 dark:hover:bg-white/10';
  return <header className="relative z-30 flex min-h-14 w-full items-center justify-between gap-1 px-2 py-2 sm:gap-3 sm:px-8">
    <button type="button" onClick={onHome} title={t('navigationHomeTitle')} aria-label={t('navigationHomeLabel')}
      className="flex h-9 shrink-0 items-center gap-2 rounded-lg px-1 font-semibold text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-white sm:px-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-600 text-sm text-white">{t('navigationBrandGlyph')}</span>
      <span className="desktop-wallpaper-heading hidden text-sm sm:inline">{t('navigationBrandName')}</span><span className="desktop-wallpaper-heading hidden text-[10px] lg:inline">{t('navigationBrandWordmark')}</span>
    </button>
    <div className="liquid-glass flex min-w-0 items-center gap-0.5 rounded-lg border border-white/50 bg-white/60 p-1 shadow-sm dark:border-white/10 dark:bg-white/5 sm:gap-1">
      <nav aria-label={t('primaryNavigation')} className="flex items-center gap-0.5">
        {[{ active: !management, action: onHome, label: t('desktopNavigation'), Icon: Home },
          { active: management, action: onManagement, label: t('managementNavigation'), Icon: Library }].map(item =>
          <button key={item.label} data-onboarding={item.Icon === Library ? 'management' : undefined} type="button" onClick={item.action} aria-current={item.active ? 'page' : undefined}
            className={`flex h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-sky-500 sm:gap-1.5 sm:px-3 ${item.active ? 'bg-sky-500/15 font-semibold text-sky-800 dark:text-sky-200' : 'text-slate-700 hover:bg-black/5 dark:text-slate-200 dark:hover:bg-white/10'}`}>
            <item.Icon size={14} className="hidden shrink-0 sm:block" /><span>{item.label}</span>
          </button>)}
      </nav>
      <span aria-hidden className="mx-0.5 h-4 border-l border-slate-300/70 dark:border-white/15" />
      <button type="button" onClick={onLanguage} aria-label={t(isEnglish ? 'switchToChinese' : 'switchToEnglish')}
        title={t(isEnglish ? 'switchToChinese' : 'switchToEnglish')}
        className="flex h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-slate-700 outline-none hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-slate-200 dark:hover:bg-white/10">
        <Languages size={14} /><span>{t(isEnglish ? 'languageEnglish' : 'languageChinese')}</span>
      </button>
      <button type="button" onClick={onTheme} aria-label={t(dark ? 'lightMode' : 'darkMode')}
        title={t(dark ? 'lightMode' : 'darkMode')} className={iconButton}>
        {dark ? <Sun size={15} /> : <Moon size={15} />}
      </button>
    </div>
  </header>;
}
