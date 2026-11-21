import { describe, expect, it } from 'vitest';
import { findExternalLinks } from '../src/portal';
import { OG_IMAGE_FILE, socialMetaTags, wantsSocialMeta } from '../src/socialmeta';

const base = 'https://therealsiyuan.github.io/CityWalk_v2/';

describe('link-preview tags', () => {
  it('only the default public build gets them', () => {
    expect(wantsSocialMeta({})).toBe(true);
    expect(wantsSocialMeta({ VITE_PORTAL: 'crazygames' })).toBe(false);
    expect(wantsSocialMeta({ VITE_SHARE_BASE: base })).toBe(false); // itch.io build
  });

  it('points crawlers at an absolute image and page address', () => {
    const t = socialMetaTags({ baseUrl: base, title: 'T', description: 'D' });
    expect(t).toContain(`<meta property="og:image" content="${base}${OG_IMAGE_FILE}" />`);
    expect(t).toContain(`<meta property="og:url" content="${base}" />`);
    expect(t).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(t).toContain('og:image:width" content="1200"');
  });

  it('escapes text so a quote cannot break the page head', () => {
    const t = socialMetaTags({ baseUrl: base, title: 'A "B" & <C>', description: 'x' });
    expect(t).toContain('content="A &quot;B&quot; &amp; &lt;C&gt;"');
  });

  it('refuses a relative or non-https base (previews would silently break)', () => {
    expect(() => socialMetaTags({ baseUrl: './', title: 'T', description: 'D' })).toThrow();
    expect(() => socialMetaTags({ baseUrl: 'http://x.org/', title: 'T', description: 'D' })).toThrow();
    expect(() => socialMetaTags({ baseUrl: 'https://x.org/game', title: 'T', description: 'D' })).toThrow();
  });

  it('would be caught by the portal scan if it ever leaked into a portal build', () => {
    expect(findExternalLinks(socialMetaTags({ baseUrl: base, title: 'T', description: 'D' }))).toContain('github.io');
  });
});
