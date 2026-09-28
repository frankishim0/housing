declare module 'country-list' {
  export type CountryData = { code: string; name: string };
  export function getData(): CountryData[];
  export function getName(code: string): string | undefined;
  export function getCode(name: string): string | undefined;
}
