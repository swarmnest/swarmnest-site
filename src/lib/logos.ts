// Presentation-only listing marks. Never added to API / MCP / llms.txt payloads.
import overrides from '../../data/logo-overrides.json';

export type LogoOverride = string | null;
const OVER: Record<string, LogoOverride> = overrides as Record<string, LogoOverride>;

/** Two-letter initials from a display name (skip filler words). */
export function initials(name: string): string {
  const parts = name
    .replace(/[^\p{L}\p{N}\s&+-]/gu, ' ')
    .trim()
    .split(/[\s&+/_-]+/)
    .filter((w) => w && !/^(the|a|an|of|for|and|ai|api|mcp)$/i.test(w));
  if (!parts.length) return name.slice(0, 2).toUpperCase() || '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Hostname for favicon bootstrap; empty if URL is unusable. */
export function logoHost(url: string | undefined | null): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    if (!/^https?:$/i.test(u.protocol)) return '';
    return u.hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

/** Google favicon CDN — no local download of vendor assets. */
export function faviconUrl(host: string, size = 64): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${size}`;
}

export type ResolvedLogo = {
  /** Remote or local image URL; null means initials-only (override or no host). */
  src: string | null;
  initials: string;
  /** True when an override forced no-image (trademark / opt-out). */
  suppressed: boolean;
};

/**
 * Resolve a listing mark.
 * - override string → that URL
 * - override null → initials only (no favicon)
 * - else favicon from site host when available, else initials
 */
export function resolveLogo(opts: {
  name: string;
  slug?: string;
  url?: string | null;
  logo?: string | null;
}): ResolvedLogo {
  const init = initials(opts.name);
  const key = opts.slug || '';
  if (key && Object.prototype.hasOwnProperty.call(OVER, key)) {
    const o = OVER[key];
    if (o === null) return { src: null, initials: init, suppressed: true };
    if (typeof o === 'string' && o) return { src: o, initials: init, suppressed: false };
  }
  if (opts.logo) return { src: opts.logo, initials: init, suppressed: false };
  const host = logoHost(opts.url);
  if (!host) return { src: null, initials: init, suppressed: false };
  return { src: faviconUrl(host), initials: init, suppressed: false };
}

/** Stable pastel-ish hue from a name, for initials tiles on dark. */
export function initialHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  // Prefer amber-adjacent / cool muted hues that read on #0b0f17
  const bases = [38, 210, 160, 280, 12, 190, 320, 55];
  return bases[h % bases.length];
}
