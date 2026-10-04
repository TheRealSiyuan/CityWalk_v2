/**
 * Landmark positions and facts. Positions come from real lat/lon projected
 * onto the compressed map (x east, z south), nudged a little so silhouettes
 * do not overlap. Facts are limited to well-established ones.
 */
import { RIVER_HALF_WIDTH, riverInfo } from './river';

export interface Landmark {
  id: string;
  name: string;
  fact: string;
  /** discovery centre */
  x: number;
  z: number;
  /** discovery radius */
  r: number;
  /** generic buildings are kept this far away */
  clear: number;
}

export const LANDMARKS: Landmark[] = [
  {
    id: 'bigben',
    name: 'Big Ben',
    fact: '“Big Ben” is really the nickname of the Great Bell inside. The tower itself was renamed Elizabeth Tower in 2012.',
    x: -311, z: 230, r: 34, clear: 62,
  },
  {
    id: 'eye',
    name: 'London Eye',
    fact: 'Opened in 2000, the wheel carries 32 capsules — one for each of London’s 32 boroughs.',
    x: -200, z: 150, r: 34, clear: 60,
  },
  {
    id: 'abbey',
    name: 'Westminster Abbey',
    fact: 'Coronations have been held here since 1066, when William the Conqueror was crowned on Christmas Day.',
    x: -372, z: 286, r: 36, clear: 58,
  },
  {
    id: 'palace',
    name: 'Buckingham Palace',
    fact: 'The King’s London residence has 775 rooms.',
    x: -640, z: 208, r: 58, clear: 95,
  },
  {
    id: 'trafalgar',
    name: 'Trafalgar Square',
    fact: 'Nelson’s Column honours Admiral Nelson, who died winning the Battle of Trafalgar in 1805.',
    x: -380, z: 6, r: 42, clear: 72,
  },
  {
    id: 'museum',
    name: 'British Museum',
    fact: 'Founded in 1753, it is home to the Rosetta Stone — the key that unlocked Egyptian hieroglyphs.',
    x: -358, z: -352, r: 52, clear: 80,
  },
  {
    id: 'stpauls',
    name: 'St Paul’s Cathedral',
    fact: 'Sir Christopher Wren designed it after the Great Fire of London destroyed the old cathedral in 1666.',
    x: 205, z: -150, r: 48, clear: 74,
  },
  {
    id: 'millennium',
    name: 'Millennium Bridge',
    fact: 'Nicknamed the “Wobbly Bridge”: it swayed so much when it opened in June 2000 that it was closed within days to be fixed.',
    x: 200, z: -47, r: 30, clear: 40,
  },
  {
    id: 'tate',
    name: 'Tate Modern',
    fact: 'This modern art gallery, opened in 2000, is housed in the former Bankside Power Station.',
    x: 198, z: 34, r: 44, clear: 78,
  },
  {
    id: 'shard',
    name: 'The Shard',
    fact: 'At about 310 metres, The Shard is the tallest building in the United Kingdom.',
    x: 435, z: 112, r: 40, clear: 56,
  },
  {
    id: 'tower',
    name: 'Tower of London',
    fact: 'The White Tower at its heart was begun by William the Conqueror in the 1070s. The Crown Jewels are kept here.',
    x: 588, z: -22, r: 48, clear: 70,
  },
  {
    id: 'bttower',
    name: 'BT Tower',
    fact: 'Opened in 1965 as the Post Office Tower, it was the tallest building in London until 1980.',
    x: -590, z: -418, r: 34, clear: 30,
  },
  {
    id: 'towerbridge',
    name: 'Tower Bridge',
    fact: 'Completed in 1894. Its roadway splits into two bascules that lift to let tall ships through.',
    x: 668, z: 84, r: 40, clear: 78,
  },
];

/** Scenery that needs its own clear ground (x, z, radius). */
const EXTRA_CLEAR: [number, number, number][] = [
  [-307, 290, 52], // Palace of Westminster
  [-307, 330, 40],
  [205, -95, 34], // steps down from St Paul's to the bridge
  [-193, 203, 32], // County Hall
  [556, -205, 24], // the City cluster
  [512, -178, 24],
  [488, -100, 26],
  [470, -232, 22],
  [10, 12, 30], // riverside wharf tower
];

/** Every circle streets and buildings must stay out of: landmarks + extras. */
export const EXCLUSIONS: [number, number, number][] = [
  ...LANDMARKS.map((l): [number, number, number] => [l.x, l.z, l.clear]),
  ...EXTRA_CLEAR,
];

/** Parks as ellipses (x, z, rx, rz): St James's Park, Green Park and small riverside greens. */
export const PARKS: [number, number, number, number][] = [
  [-505, 150, 100, 62],
  [-655, 88, 78, 52],
  [-150, 190, 30, 55],
  [560, 135, 40, 26],
];

export function inPark(x: number, z: number): boolean {
  for (const [px, pz, rx, rz] of PARKS) {
    const dx = (x - px) / rx;
    const dz = (z - pz) / rz;
    if (dx * dx + dz * dz < 1) return true;
  }
  return false;
}

/**
 * Neighbourhoods. Each has its own materials, heights and street character
 * (see SPECS in streets.ts): Portland-stone Westminster, the brick-and-stucco
 * West End, the City's stone lanes and glass towers, the South Bank's
 * warehouses, and terraced streets further south.
 */
export type District = 'westminster' | 'westend' | 'holborn' | 'city' | 'southbank' | 'south';

export function districtAt(x: number, z: number): District {
  const r = riverInfo(x, z);
  // which bank: the cross product of the river's direction and the offset
  const north = r.tx * (z - r.cz) - r.tz * (x - r.cx) < 0;
  if (north) {
    if (x < -235 && z > -70) return 'westminster';
    if (x < 40) return 'westend';
    if (x < 150) return 'holborn';
    return 'city';
  }
  return r.dist < 230 ? 'southbank' : 'south';
}

/** Plain (non-landmark) Thames crossings: point near the river, colour, style. */
export const BRIDGES: { name: string; x: number; z: number; color: number; width: number; masts?: boolean }[] = [
  { name: 'Lambeth Bridge', x: -296, z: 425, color: 0xc0625a, width: 9 },
  { name: 'Westminster Bridge', x: -257, z: 227, color: 0x7fae8a, width: 11 },
  { name: 'Hungerford Bridge', x: -221, z: 60, color: 0xf1ede2, width: 7, masts: true },
  { name: 'Waterloo Bridge', x: -159, z: -19, color: 0xe2ddd0, width: 11 },
  { name: 'Blackfriars Bridge', x: 84, z: -50, color: 0xc56a5c, width: 11 },
  { name: 'Southwark Bridge', x: 286, z: -28, color: 0x8fa66a, width: 9 },
  { name: 'London Bridge', x: 411, z: 3, color: 0xcfc9bb, width: 12 },
];

/**
 * Spawn at the east end of Westminster Bridge looking straight across it at
 * Big Ben, so the very first frame says "London" and pushing forward walks
 * you over the bridge rather than into the river.
 */
export const SPAWN = (() => {
  const r = riverInfo(-257, 227);
  // unit normal pointing to the east (London Eye) bank
  let nx = -r.tz;
  let nz = r.tx;
  if (nx < 0) {
    nx = -nx;
    nz = -nz;
  }
  const d = RIVER_HALF_WIDTH + 17;
  // camera yaw convention: the camera looks along (-sin yaw, -cos yaw)
  return { x: r.cx + nx * d, z: r.cz + nz * d, yaw: Math.atan2(nx, nz) };
})();
