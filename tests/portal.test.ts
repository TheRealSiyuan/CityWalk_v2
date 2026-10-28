import { describe, expect, it } from 'vitest';
import { findExternalLinks, parsePortal, portalRules } from '../src/portal';

describe('portal build variants', () => {
  it('defaults to the open-web build with links and multiplayer', () => {
    expect(parsePortal(undefined)).toBe('web');
    expect(parsePortal('nonsense')).toBe('web');
    expect(portalRules('web')).toEqual({ externalLinks: true, multiplayer: true });
  });

  it('the CrazyGames build has no external links and no unshareable rooms', () => {
    expect(parsePortal('crazygames')).toBe('crazygames');
    expect(portalRules('crazygames')).toEqual({ externalLinks: false, multiplayer: false });
  });

  it('the link scanner flags other sites and portals but not library namespaces', () => {
    expect(findExternalLinks('ns="http://www.w3.org/2000/svg" see https://jcgt.org/published/0007/04/01/')).toEqual([]);
    expect(findExternalLinks('const b="https://therealsiyuan.github.io/CityWalk_v2/"')).toContain('github.io');
    expect(findExternalLinks('play on itch.io')).toContain('itch.io');
    expect(findExternalLinks('a href="https://example.com/x"')).toContain('https://example.com/x');
    expect(findExternalLinks('`${base}?room=${r}`')).toContain('?room=');
  });
});
