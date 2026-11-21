/**
 * Link-preview tags (Open Graph / Twitter card) for the public web build, so a room or
 * challenge link pasted into a chat app shows a picture and a title instead of a bare URL.
 * Used at build time only (vite.config.ts); nothing here runs in the game.
 *
 * Portal builds get none of this: the CrazyGames build must carry no links to other sites,
 * and on itch.io the host page supplies its own preview.
 */
export const OG_IMAGE_FILE = 'og-image.jpg';

export interface SocialMeta {
  /** Absolute address of the deployed game, ending in '/'. */
  baseUrl: string;
  title: string;
  description: string;
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** True only for the default public build (no portal, no foreign share base). */
export function wantsSocialMeta(env: { VITE_PORTAL?: string; VITE_SHARE_BASE?: string }): boolean {
  return !env.VITE_PORTAL && !env.VITE_SHARE_BASE;
}

/** The `<meta>` tags to put in `<head>`. Crawlers need absolute URLs, so the base must be absolute. */
export function socialMetaTags(m: SocialMeta): string {
  if (!/^https:\/\/[^/]+\/(.*\/)?$/.test(m.baseUrl)) throw new Error(`social meta base must be an absolute https URL ending in '/': ${m.baseUrl}`);
  const image = m.baseUrl + OG_IMAGE_FILE;
  const tags: [string, string, string][] = [
    ['property', 'og:type', 'website'],
    ['property', 'og:site_name', 'CityWalk'],
    ['property', 'og:title', m.title],
    ['property', 'og:description', m.description],
    ['property', 'og:url', m.baseUrl],
    ['property', 'og:image', image],
    ['property', 'og:image:width', '1200'],
    ['property', 'og:image:height', '630'],
    ['property', 'og:image:alt', 'A cartoon Londoner on a rooftop near Parliament and the river'],
    ['name', 'twitter:card', 'summary_large_image'],
    ['name', 'twitter:title', m.title],
    ['name', 'twitter:description', m.description],
    ['name', 'twitter:image', image],
  ];
  return tags.map(([k, n, v]) => `<meta ${k}="${n}" content="${esc(v)}" />`).join('\n    ');
}
