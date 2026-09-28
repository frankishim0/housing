import en from '@/messages/en';

export const defaultLocale = 'en';
export const supportedLocales = [defaultLocale] as const;
export type Locale = (typeof supportedLocales)[number];

export function getMessages(locale: string = defaultLocale) {
  switch (locale) {
    case 'en':
    default:
      return en;
  }
}
