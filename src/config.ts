/**
 * Every traversal / feel tuning value lives here.
 * Units: metres, seconds, radians. Edit, save, and Vite hot-reloads.
 */
export const CONFIG = {
  // --- gravity & body -----------------------------------------------------
  gravity: 24, // m/s² (gamey: ~2.4 g makes jumps and swings feel snappy)
  playerRadius: 0.45,
  playerHeight: 1.8,
  maxSpeed: 40, // hard cap on any velocity

  // --- walking / running --------------------------------------------------
  walkSpeed: 4.5,
  runSpeed: 11,
  runThreshold: 0.7, // joystick deflection (0..1) above which you start running
  groundAccel: 55,
  turnRate: 14, // how fast the avatar turns to face travel direction

  // --- jumping ------------------------------------------------------------
  jumpSpeed: 10.5,
  coyoteTime: 0.12, // grace period after walking off an edge
  jumpBuffer: 0.15, // jump pressed slightly early still counts
  stepHeight: 0.7, // ledges this low are walked up
  ledgeAssist: 1.3, // while airborne, ledges this far above your feet catch you

  // --- air ----------------------------------------------------------------
  airControl: 10, // steering acceleration while falling

  // --- swinging -----------------------------------------------------------
  swing: {
    maxRope: 58, // furthest anchor you can attach to
    minRope: 4, // rope never reels in shorter than this
    minAnchorRise: 3, // anchor must be at least this far above your feet
    aimConeDot: -0.3, // how far behind you an anchor may be (-1 = anywhere)
    idealDist: 28, // auto-aim prefers anchors about this far away
    idealElevation: 0.7, // ...and at about this sine-of-elevation (~45°)
    groundClearance: 3, // rope reels in so the swing's low point clears the ground
    reelSpeed: 16, // m/s the rope shortens while reeling
    reelPull: 0.5, // 0..1 share of that reel speed you keep as momentum toward the anchor
    attachHop: 6.5, // upward kick when you attach while standing
    pump: 8, // forward acceleration from pushing the stick mid-swing
    damping: 0, // 0 = ideal pendulum; raise for a heavier feel
    jumpOffBoost: 5, // extra upward speed when you jump out of a swing
  },

  // --- camera -------------------------------------------------------------
  camera: {
    distance: 8.5,
    swingDistance: 12.5,
    height: 1.7,
    lookSensitivity: 0.0055,
    minPitch: -0.3,
    maxPitch: 1.25,
    autoFollowDelay: 1.2, // seconds after last look-drag before camera trails you
    autoFollowRate: 1.6,
    baseFov: 62,
    speedFov: 14, // extra FOV at full swing speed
  },

  // --- multiplayer --------------------------------------------------------
  net: {
    sendHz: 12,
    interpDelay: 0.16, // seconds remote avatars are rendered in the past
    maxPlayers: 8,
  },

  // --- performance --------------------------------------------------------
  perf: {
    maxPixelRatio: 1.5,
    minPixelRatio: 0.65,
  },
};

export type Config = typeof CONFIG;
