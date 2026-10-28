/**
 * Build variants for game portals. A portal build is chosen at build time with
 * `VITE_PORTAL=<name>` (see the `package:*` scripts) and changes only what the
 * host's rules require; gameplay is identical.
 */
export type Portal = 'web' | 'crazygames';

export interface PortalRules {
  /** May the game show links to other sites (e.g. a Share link to GitHub Pages)? */
  externalLinks: boolean;
  /** Peer-to-peer rooms. Off where a room link cannot be shared, so nobody could join. */
  multiplayer: boolean;
}

const RULES: Record<Portal, PortalRules> = {
  web: { externalLinks: true, multiplayer: true },
  // CrazyGames: no links to or promotion of other sites, no other portal's branding.
  crazygames: { externalLinks: false, multiplayer: false },
};

export function parsePortal(v: string | undefined): Portal {
  return v === 'crazygames' ? 'crazygames' : 'web';
}

export function portalRules(p: Portal): PortalRules {
  return RULES[p];
}

/** Hostnames or URL fragments a no-external-links build must never contain. */
export const FORBIDDEN_IN_PORTAL_BUILD = ['github.io', 'github.com', 'itch.io', 'itch.zone', 'poki', '?room='];
/** Absolute URLs that are harmless library internals (XML namespaces, a paper citation in three.js). */
export const ALLOWED_URL_PREFIXES = ['http://www.w3.org/', 'https://jcgt.org/'];

/** Returns every forbidden link or URL found in build output text. Empty means clean. */
export function findExternalLinks(text: string): string[] {
  const hits = new Set<string>();
  const lower = text.toLowerCase();
  for (const f of FORBIDDEN_IN_PORTAL_BUILD) if (lower.includes(f)) hits.add(f);
  for (const m of text.matchAll(/https?:\/\/[^\s"'`)<>]+/g)) {
    if (!ALLOWED_URL_PREFIXES.some((p) => m[0].startsWith(p))) hits.add(m[0]);
  }
  return [...hits];
}
