import { Injectable, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

export type Locale = 'de' | 'fr' | 'it' | 'en';

export interface Language {
  code: Locale;
  flag: string;
  label: string;
}

export const LANGUAGES: Language[] = [
  { code: 'de', flag: '🇩🇪', label: 'DE' },
  { code: 'fr', flag: '🇫🇷', label: 'FR' },
  { code: 'it', flag: '🇮🇹', label: 'IT' },
  { code: 'en', flag: '🇬🇧', label: 'EN' },
];

const STORAGE_KEY = 'app-locale';
const DEFAULT_LOCALE: Locale = 'de';

@Injectable({
  providedIn: 'root',
})
export class LanguageService {
  private readonly translate = inject(TranslateService);

  readonly locale = signal<Locale>(this.loadLocale());
  readonly languages = LANGUAGES;

  constructor() {
    this.translate.setDefaultLang(DEFAULT_LOCALE);
    this.translate.use(this.locale());
  }

  setLocale(code: Locale): void {
    this.locale.set(code);
    localStorage.setItem(STORAGE_KEY, code);
    this.translate.use(code);
  }

  private loadLocale(): Locale {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && LANGUAGES.some((l) => l.code === stored)) {
      return stored as Locale;
    }
    return DEFAULT_LOCALE;
  }
}
