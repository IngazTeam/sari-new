import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { MerchantUxCopy } from '../locales/merchant-ux.schema';

export const SUPPORTED_LANGUAGE_CODES = [
  'ar',
  'en',
  'fr',
  'tr',
  'es',
  'it',
  'de',
  'zh',
] as const;

export type SupportedLanguageCode = (typeof SUPPORTED_LANGUAGE_CODES)[number];

type TranslationModule = { default: Record<string, unknown> };
type MerchantUxModule = { default: MerchantUxCopy };

// Keep every catalogue out of the application entry chunk. Vite emits one
// independently cacheable chunk per language and fetches only the selected one.
const translationLoaders: Record<SupportedLanguageCode, () => Promise<TranslationModule>> = {
  ar: () => import('../locales/ar.json'),
  en: () => import('../locales/en.json'),
  fr: () => import('../locales/fr.json'),
  tr: () => import('../locales/tr.json'),
  es: () => import('../locales/es.json'),
  it: () => import('../locales/it.json'),
  de: () => import('../locales/de.json'),
  zh: () => import('../locales/zh.json'),
};

// The recovered merchant flows use a typed semantic catalogue. Arabic and
// English have first-party copy; other locales get explicit English copy until
// their reviewed translation exists, rather than falling through mismatched
// legacy text0/text1 maps.
const merchantUxLoaders: Record<SupportedLanguageCode, () => Promise<MerchantUxModule>> = {
  ar: () => import('../locales/merchant-ux.ar'),
  en: () => import('../locales/merchant-ux.en'),
  fr: () => import('../locales/merchant-ux.en'),
  tr: () => import('../locales/merchant-ux.en'),
  es: () => import('../locales/merchant-ux.en'),
  it: () => import('../locales/merchant-ux.en'),
  de: () => import('../locales/merchant-ux.en'),
  zh: () => import('../locales/merchant-ux.en'),
};

async function loadTranslations(language: SupportedLanguageCode): Promise<TranslationModule> {
  const [legacy, merchantUx] = await Promise.all([
    translationLoaders[language](),
    merchantUxLoaders[language](),
  ]);

  return {
    default: {
      ...legacy.default,
      merchantUx: merchantUx.default,
    },
  };
}

function normalizeLanguage(candidate?: string | null): SupportedLanguageCode | null {
  if (!candidate) return null;

  const baseLanguage = candidate.toLowerCase().split(/[-_]/, 1)[0];
  return SUPPORTED_LANGUAGE_CODES.includes(baseLanguage as SupportedLanguageCode)
    ? (baseLanguage as SupportedLanguageCode)
    : null;
}

function detectInitialLanguage(): SupportedLanguageCode {
  if (typeof window === 'undefined') return 'ar';

  try {
    const savedLanguage = normalizeLanguage(window.localStorage.getItem('i18nextLng'));
    if (savedLanguage) return savedLanguage;
  } catch {
    // Storage can be unavailable in privacy modes; navigator remains a safe fallback.
  }

  const browserLanguages = window.navigator.languages?.length
    ? window.navigator.languages
    : [window.navigator.language];

  for (const language of browserLanguages) {
    const normalized = normalizeLanguage(language);
    if (normalized) return normalized;
  }

  return 'ar';
}

async function ensureLanguageLoaded(language: SupportedLanguageCode): Promise<void> {
  if (i18n.hasResourceBundle(language, 'translation')) return;

  const module = await loadTranslations(language);
  i18n.addResourceBundle(language, 'translation', module.default, true, true);
}

function updateDocumentLanguage(language: string): void {
  if (typeof document === 'undefined') return;

  const normalized = normalizeLanguage(language) ?? 'ar';
  document.documentElement.dir = normalized === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.lang = normalized;
}

let initializationPromise: Promise<typeof i18n> | null = null;

export function initializeI18n(): Promise<typeof i18n> {
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    const initialLanguage = detectInitialLanguage();
    const initialTranslations = await loadTranslations(initialLanguage);

    await i18n
      .use(initReactI18next)
      .init({
        resources: {
          [initialLanguage]: {
            translation: initialTranslations.default,
          },
        },
        lng: initialLanguage,
        fallbackLng: 'ar',
        supportedLngs: [...SUPPORTED_LANGUAGE_CODES],
        nonExplicitSupportedLngs: true,
        interpolation: {
          escapeValue: false,
        },
      });

    updateDocumentLanguage(initialLanguage);

    // Arabic is the product fallback. Load it after first paint for visitors who
    // selected another language, without putting it on their critical path.
    if (initialLanguage !== 'ar') {
      void ensureLanguageLoaded('ar').catch((error) => {
        console.warn('[i18n] Failed to preload the fallback language', error);
      });
    }

    return i18n;
  })();

  return initializationPromise;
}

export async function changeAppLanguage(candidate: string): Promise<SupportedLanguageCode> {
  const language = normalizeLanguage(candidate);
  if (!language) throw new Error(`Unsupported language: ${candidate}`);

  await initializeI18n();
  await ensureLanguageLoaded(language);
  await i18n.changeLanguage(language);

  try {
    window.localStorage.setItem('i18nextLng', language);
  } catch {
    // A successful language switch must not depend on persistent storage access.
  }

  return language;
}

i18n.on('languageChanged', updateDocumentLanguage);

export default i18n;
