// Origins the app window is permitted to navigate to or load: Apple's own
// storefront, playback, and sign-in domains. Anything else opens in the
// system browser instead of inside Auralis.
export const ALLOWED_ORIGINS = new Set([
  'music.apple.com',
  'authorize.music.apple.com',
  'idmsa.apple.com',
  'appleid.apple.com',
]);

export function isAllowedUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    if (url.protocol !== 'https:') return false;
    return ALLOWED_ORIGINS.has(url.hostname);
  } catch {
    return false;
  }
}
