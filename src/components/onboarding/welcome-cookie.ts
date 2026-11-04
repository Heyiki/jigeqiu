export const WELCOME_COOKIE = 'jigeqiu_onboarding_seen_v1';

/** Only plain HTTP outside a trustworthy context uses the lightweight marker. */
export function usesWelcomeCookie(): boolean {
  return !window.isSecureContext && window.location.protocol === 'http:';
}

export function hasWelcomeCookie(): boolean {
  try {
    return document.cookie.split(';').some(part => part.trim() === `${WELCOME_COOKIE}=1`);
  } catch {
    return false;
  }
}

export function rememberWelcomeCookie(): boolean {
  try {
    document.cookie = `${WELCOME_COOKIE}=1; Max-Age=34560000; Path=/; SameSite=Lax`;
    return hasWelcomeCookie();
  } catch {
    return false;
  }
}
