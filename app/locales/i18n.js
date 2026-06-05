import enMessages from './en.json';
import frMessages from './fr.json';

const messages = {
  en: enMessages,
  fr: frMessages,
};

/**
 * Get the user's preferred language from localStorage or browser settings
 */
export function getPreferredLanguage() {
  // Check localStorage first
  const stored = typeof window !== 'undefined' ? localStorage.getItem('preferredLanguage') : null;
  if (stored && messages[stored]) {
    return stored;
  }

  // Fall back to browser language
  if (typeof navigator !== 'undefined') {
    const browserLang = navigator.language?.split('-')[0];
    if (browserLang && messages[browserLang]) {
      return browserLang;
    }
  }

  // Default to English
  return 'en';
}

/**
 * Set the preferred language in localStorage
 */
export function setPreferredLanguage(lang) {
  if (messages[lang]) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('preferredLanguage', lang);
    }
  }
}

/**
 * Get all messages for a language
 */
export function getMessages(lang = 'en') {
  return messages[lang] || messages.en;
}

/**
 * Translate a key using dot notation (e.g., 'settings.page_heading')
 * Supports simple variable replacement with {{key}} syntax
 */
export function t(key, lang = 'en', variables = {}) {
  const msgs = getMessages(lang);
  const keys = key.split('.');
  let value = msgs;

  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      return key; // Return the key itself if not found
    }
  }

  // Replace variables in the format {{variableName}}
  if (typeof value === 'string' && Object.keys(variables).length > 0) {
    return value.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      return variables[varName] || match;
    });
  }

  return value;
}

/**
 * Get supported languages
 */
export function getSupportedLanguages() {
  return Object.keys(messages);
}

/**
 * Get language display name
 */
export function getLanguageName(lang) {
  const names = {
    en: 'English',
    fr: 'Français',
  };
  return names[lang] || lang.toUpperCase();
}
