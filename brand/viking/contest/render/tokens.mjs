// Design tokens for the "Autumn Escape" contest set.
//
// Every number here was measured off the four reference frames (a 9:16 Story and a 3-slide
// 1080×1350 carousel) rather than guessed, so the rebuild keeps the reference *structure* while
// carrying new copy. Colours are the ratios sampled from the references themselves.

export const SIZE = {
  post: { w: 1080, h: 1350 },
  story: { w: 1080, h: 1920 },
};

// Sampled from the references: the tape orange is lighter/hotter than the brand swatch, and the
// price/card type is a deeper amber. Keeping both avoids the "everything one orange" failure.
export const C = {
  tape: '#FF9E27',        // reference tape fill (255,158,39)
  tapeWarm: '#F49A2C',    // story reference tape (244,154,44)
  ink: '#0B0908',         // type on the tape, near-black with a warm cast
  card: 'rgba(14,11,9,0.86)',
  cardSolid: '#141414',
  amber: '#F39A2B',       // brand orange: titles, keys, rules
  amberBright: '#FFC061',
  cream: '#FFD9A8',
  paper: '#FFFAF1',       // reference white strip (255,250,241)
  white: '#FFFFFF',
  alert: '#FF4D3D',       // strike-through + winner badge only
  mute: '#D8CFC2',
};

export const FONT = {
  display: 'Lalezar',
  text: 'Vazir',
};

// Geometry measured on the 1080-wide references.
export const GEO = {
  margin: 64,
  tapeTop: { y: 74, h: 88, angle: -2.1 },       // p1/p2/p3
  tapeStory: { y: 120, h: 109, angle: -3.2 },   // 1320-wide story → scaled
  logoTop: 190,
  logoSize: 122,
  logoRight: 56,
  capsuleTop: 200,
  capsuleLeft: 52,
  stripHeight: 74,
  stripAngle: -1.6,
};

/** Scale factor for a story built on a 1320-wide reference. */
export const STORY_SCALE = SIZE.story.w / 1320;

/** Rounded-panel geometry used by the card grids. */
export const CARD = {
  radius: 26,
  border: 2.4,
  borderColor: 'rgba(243,154,43,0.62)',
  fill: 'rgba(12,10,9,0.94)',
  gap: 20,
};
