import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import translationAR from '../locales/ar.json';
import translationEN from '../locales/en.json';
import translationFR from '../locales/fr.json';
import translationTR from '../locales/tr.json';
import translationES from '../locales/es.json';
import translationIT from '../locales/it.json';
import translationDE from '../locales/de.json';
import translationZH from '../locales/zh.json';

const resources = {
  ar: {
    translation: translationAR
  },
  en: {
    translation: translationEN
  },
  fr: {
    translation: translationFR
  },
  tr: {
    translation: translationTR
  },
  es: {
    translation: translationES
  },
  it: {
    translation: translationIT
  },
  de: {
    translation: translationDE
  },
  zh: {
    translation: translationZH
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'ar',
    interpolation: {
      escapeValue: false
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage']
    }
  });

// Update HTML dir and lang attributes when language changes
i18n.on('languageChanged', (lng) => {
  document.documentElement.dir = lng === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.lang = lng;
});

// Set initial dir and lang
document.documentElement.dir = i18n.language === 'ar' ? 'rtl' : 'ltr';
document.documentElement.lang = i18n.language;

export default i18n;
