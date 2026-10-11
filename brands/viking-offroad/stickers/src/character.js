const CUR = { sleeve: '#8a4a1c', tunic: 'tunicM' };
const K = '#3b2414';      // outline
const SKIN = '#f2c29b';

// ---------- character parts (native frame: head centre (0,-62), feet ~ y 128) ----------
const EYES = {
  normal: `<g>${[-1, 1].map(s => `<ellipse cx="${24 * s}" cy="-64" rx="10" ry="12.5" fill="#fff" stroke="${K}" stroke-width="4"/><circle cx="${24 * s + 2}" cy="-62" r="6" fill="${K}"/><circle cx="${24 * s + 4}" cy="-65" r="2.2" fill="#fff"/>`).join('')}</g>`,
  happy: `<g fill="none" stroke="${K}" stroke-width="6" stroke-linecap="round">${[-1, 1].map(s => `<path d="M ${24 * s - 11} -60 Q ${24 * s} -74 ${24 * s + 11} -60"/>`).join('')}</g>`,
  wink: `<g><ellipse cx="-24" cy="-64" rx="10" ry="12.5" fill="#fff" stroke="${K}" stroke-width="4"/><circle cx="-22" cy="-62" r="6" fill="${K}"/><circle cx="-20" cy="-65" r="2.2" fill="#fff"/><path d="M 13 -62 Q 24 -72 35 -62" fill="none" stroke="${K}" stroke-width="6" stroke-linecap="round"/></g>`,
  shocked: `<g>${[-1, 1].map(s => `<circle cx="${25 * s}" cy="-66" r="14" fill="#fff" stroke="${K}" stroke-width="4"/><circle cx="${25 * s}" cy="-66" r="4.5" fill="${K}"/>`).join('')}</g>`,
  sleepy: `<g fill="none" stroke="${K}" stroke-width="6" stroke-linecap="round">${[-1, 1].map(s => `<path d="M ${24 * s - 11} -64 Q ${24 * s} -56 ${24 * s + 11} -64"/>`).join('')}</g>`,
  love: `<g fill="#e0362b" stroke="${K}" stroke-width="3.5">${[-1, 1].map(s => `<path d="M ${24 * s} -52 C ${24 * s - 20} -62 ${24 * s - 14} -80 ${24 * s} -71 C ${24 * s + 14} -80 ${24 * s + 20} -62 ${24 * s} -52 Z"/>`).join('')}</g>`,
  cool: `<g><path d="M -50 -74 L 50 -74 L 46 -58 C 44 -48 30 -46 22 -48 C 12 -50 8 -58 6 -64 L -6 -64 C -8 -58 -12 -50 -22 -48 C -30 -46 -44 -48 -46 -58 Z" fill="#1d1d22" stroke="${K}" stroke-width="4" stroke-linejoin="round"/><path d="M -40 -70 L -28 -70 M 14 -70 L 26 -70" stroke="#6d7c8c" stroke-width="4" stroke-linecap="round"/></g>`,
  cry: `<g><g fill="none" stroke="${K}" stroke-width="6" stroke-linecap="round">${[-1, 1].map(s => `<path d="M ${24 * s - 11} -62 Q ${24 * s} -70 ${24 * s + 11} -62"/>`).join('')}</g>${[-1, 1].map(s => `<path d="M ${24 * s} -58 C ${24 * s - 6} -40 ${24 * s - 4} -26 ${24 * s} -18 C ${24 * s + 4} -26 ${24 * s + 6} -40 ${24 * s} -58 Z" fill="#7cc4f0" stroke="#2f6f9c" stroke-width="2.5"/>`).join('')}</g>`,
  laugh: `<g fill="none" stroke="${K}" stroke-width="6" stroke-linecap="round">${[-1, 1].map(s => `<path d="M ${24 * s - 11 * s} -70 L ${24 * s + 9 * s} -63 L ${24 * s - 11 * s} -56"/>`).join('')}</g>`
};
const BROWS = {
  none: '',
  up: `<g stroke="#8a3d12" stroke-width="7" stroke-linecap="round">${[-1, 1].map(s => `<path d="M ${16 * s} -88 Q ${26 * s} -94 ${36 * s} -88" fill="none"/>`).join('')}</g>`,
  angry: `<g stroke="#8a3d12" stroke-width="8" stroke-linecap="round">${[-1, 1].map(s => `<path d="M ${12 * s} -78 L ${38 * s} -88"/>`).join('')}</g>`,
  sad: `<g stroke="#8a3d12" stroke-width="7" stroke-linecap="round">${[-1, 1].map(s => `<path d="M ${12 * s} -88 L ${36 * s} -80"/>`).join('')}</g>`,
  raised: `<g stroke="#8a3d12" stroke-width="7" stroke-linecap="round" fill="none"><path d="M -36 -86 L -14 -86"/><path d="M 14 -92 Q 26 -100 38 -90"/></g>`
};
const MOUTHS = {
  smile: `<path d="M -17 -16 Q 0 6 17 -16 Z" fill="#5a1f0a" stroke="${K}" stroke-width="3.5" stroke-linejoin="round"/><path d="M -9 -6 Q 0 -1 9 -6" fill="none" stroke="#e05a4a" stroke-width="5" stroke-linecap="round"/>`,
  grin: `<path d="M -24 -18 Q 0 18 24 -18 Z" fill="#5a1f0a" stroke="${K}" stroke-width="4" stroke-linejoin="round"/><path d="M -21 -16 L 21 -16 L 18 -9 L -18 -9 Z" fill="#fff"/><path d="M -10 2 Q 0 7 10 2" fill="none" stroke="#e05a4a" stroke-width="6" stroke-linecap="round"/>`,
  o: `<ellipse cx="0" cy="-8" rx="10" ry="13" fill="#5a1f0a" stroke="${K}" stroke-width="4"/>`,
  sad: `<path d="M -15 -2 Q 0 -16 15 -2" fill="none" stroke="#5a1f0a" stroke-width="7" stroke-linecap="round"/>`,
  grit: `<rect x="-18" y="-17" width="36" height="14" rx="5" fill="#fff" stroke="${K}" stroke-width="4"/><path d="M -6 -17 L -6 -3 M 6 -17 L 6 -3" stroke="${K}" stroke-width="2.5"/>`,
  smirk: `<path d="M -15 -10 Q 4 0 18 -16" fill="none" stroke="#5a1f0a" stroke-width="7" stroke-linecap="round"/>`,
  tongue: `<path d="M -18 -16 Q 0 4 18 -16 Z" fill="#5a1f0a" stroke="${K}" stroke-width="3.5"/><path d="M 0 -10 C 14 -10 16 8 6 10 C -2 11 -4 0 0 -10 Z" fill="#e05a4a" stroke="${K}" stroke-width="3"/>`,
  sleep: `<ellipse cx="0" cy="-8" rx="7" ry="5" fill="#5a1f0a"/>`
};

const ARM_POS = {
  down: [[-74, 84], [74, 84]],
  wave: [[-74, 84], [104, -46]],
  up: [[-102, -48], [102, -48]],
  hold: [[-74, 84], [46, 56]],
  hold2: [[-44, 56], [44, 56]],
  thumb: [[-74, 84], [96, 26]],
  point: [[-74, 84], [112, -6]],
  chin: [[-74, 84], [26, 18]],
  raise: [[-74, 84], [92, -60]],
  wheel: [[-46, 40], [46, 40]],
  shrug: [[-104, 6], [104, 6]]
};

function arm(side, [hx, hy], fist) {
  const sx = 50 * side, sy = 20;
  const cx = (sx + hx) / 2 + 22 * side, cy = (sy + hy) / 2 + 10;
  return `<path d="M ${sx} ${sy} Q ${cx} ${cy} ${hx} ${hy}" fill="none" stroke="${K}" stroke-width="32" stroke-linecap="round"/>
    <path d="M ${sx} ${sy} Q ${cx} ${cy} ${hx} ${hy}" fill="none" stroke="${CUR.sleeve}" stroke-width="22" stroke-linecap="round"/>
    <circle cx="${hx}" cy="${hy}" r="${fist ? 16 : 15}" fill="${SKIN}" stroke="${K}" stroke-width="5"/>`;
}

function thumbUp(hx, hy) {
  return `<rect x="${hx - 6}" y="${hy - 36}" width="13" height="26" rx="6" fill="${SKIN}" stroke="${K}" stroke-width="5"/><circle cx="${hx}" cy="${hy}" r="17" fill="${SKIN}" stroke="${K}" stroke-width="5"/>`;
}
function finger(hx, hy) {
  return `<rect x="${hx}" y="${hy - 7}" width="30" height="13" rx="6" fill="${SKIN}" stroke="${K}" stroke-width="5"/><circle cx="${hx}" cy="${hy}" r="16" fill="${SKIN}" stroke="${K}" stroke-width="5"/>`;
}

const PROPS = {
  mug: (x, y) => `<g transform="translate(${x + 8} ${y - 18})"><path d="M -24 -26 L 22 -26 L 18 30 C 17 36 12 38 8 38 L -14 38 C -18 38 -22 36 -22 30 Z" fill="#e9dcc0" stroke="${K}" stroke-width="6" stroke-linejoin="round"/><path d="M 20 -12 C 44 -12 44 18 18 18" fill="none" stroke="${K}" stroke-width="7"/><rect x="-22" y="-26" width="42" height="9" fill="#6b3d1c"/><path d="M -8 -34 C -16 -46 0 -52 -8 -64 M 8 -34 C 0 -46 16 -52 8 -64" fill="none" stroke="#fff6e2" stroke-width="5" stroke-linecap="round"/></g>`,
  tea: (x, y) => `<g transform="translate(${x + 6} ${y - 22})"><path d="M -20 -26 C -10 -8 -14 10 -24 26 C -24 40 24 40 24 26 C 14 10 10 -8 20 -26 Z" fill="#c4451e" stroke="${K}" stroke-width="6" stroke-linejoin="round"/><ellipse cx="0" cy="42" rx="36" ry="7" fill="#e9dcc0" stroke="${K}" stroke-width="5"/><path d="M -4 -34 C -12 -46 4 -52 -4 -64 M 10 -34 C 2 -46 18 -52 10 -64" fill="none" stroke="#fff6e2" stroke-width="5" stroke-linecap="round"/></g>`,
  axe: (x, y) => `<g transform="translate(${x} ${y}) rotate(18)"><rect x="-8" y="-110" width="16" height="150" rx="7" fill="url(#wood)" stroke="${K}" stroke-width="6"/><path d="M 4 -110 C 60 -130 92 -84 88 -34 C 58 -50 32 -48 4 -42 Z" fill="url(#steel)" stroke="${K}" stroke-width="6" stroke-linejoin="round"/></g>`,
  wheel: () => `<g transform="translate(0 46)"><circle r="56" fill="none" stroke="${K}" stroke-width="20"/><circle r="56" fill="none" stroke="#5a3418" stroke-width="12"/><circle r="14" fill="#5a3418" stroke="${K}" stroke-width="5"/><path d="M -50 0 L -14 0 M 14 0 L 50 0 M 0 14 L 0 50" stroke="${K}" stroke-width="12" stroke-linecap="round"/><path d="M -50 0 L -14 0 M 14 0 L 50 0 M 0 14 L 0 50" stroke="#5a3418" stroke-width="6" stroke-linecap="round"/></g>`,
  compass: (x, y) => `<g transform="translate(${x + 4} ${y - 30})"><circle r="30" fill="#e9dcc0" stroke="${K}" stroke-width="6"/><path d="M 0 -22 L 7 0 L 0 22 L -7 0 Z" fill="#b8431e" stroke="${K}" stroke-width="3"/><circle r="4" fill="${K}"/></g>`,
  flag: (x, y) => `<g transform="translate(${x} ${y})"><rect x="-5" y="-130" width="10" height="160" rx="4" fill="url(#wood)" stroke="${K}" stroke-width="5"/><path d="M 5 -126 L 80 -104 L 5 -80 Z" fill="url(#orange)" stroke="${K}" stroke-width="6" stroke-linejoin="round"/></g>`,
  camera: () => `<g transform="translate(0 50)"><rect x="-60" y="-34" width="120" height="76" rx="12" fill="#5a3418" stroke="${K}" stroke-width="6"/><rect x="-22" y="-48" width="44" height="18" rx="5" fill="#5a3418" stroke="${K}" stroke-width="5"/><circle cy="4" r="27" fill="url(#steel)" stroke="${K}" stroke-width="6"/><circle cy="4" r="12" fill="#3a5f86"/></g>`,
  plate: (x, y) => `<g transform="translate(${x + 10} ${y - 10})"><ellipse rx="48" ry="14" fill="#f4ede0" stroke="${K}" stroke-width="5"/><ellipse cx="-8" cy="-6" rx="22" ry="9" fill="#fff" stroke="${K}" stroke-width="3"/><circle cx="-8" cy="-8" r="7" fill="#f7b334"/><rect x="12" y="-14" width="22" height="9" rx="4" fill="#b8541c" stroke="${K}" stroke-width="3"/></g>`,
  torch: (x, y) => `<g transform="translate(${x} ${y}) rotate(12)"><rect x="-6" y="-90" width="12" height="110" rx="5" fill="url(#wood)" stroke="${K}" stroke-width="5"/><path d="M 0 -150 C 22 -124 30 -110 24 -94 C 20 -84 8 -80 0 -80 C -8 -80 -20 -84 -24 -94 C -28 -108 -16 -118 -12 -134 C -6 -124 -4 -116 0 -150 Z" fill="url(#fire)" stroke="#5a1f0a" stroke-width="5" stroke-linejoin="round"/></g>`,
  umbrella: (x, y) => `<g transform="translate(${x} ${y})"><path d="M 0 0 L 0 -120" stroke="${K}" stroke-width="8"/><path d="M -80 -112 C -70 -170 70 -170 80 -112 C 60 -122 40 -122 26 -112 C 14 -122 -14 -122 -26 -112 C -40 -122 -60 -122 -80 -112 Z" fill="url(#orange)" stroke="${K}" stroke-width="6" stroke-linejoin="round"/></g>`,
  phone: (x, y) => `<g transform="translate(${x + 4} ${y - 26}) rotate(-8)"><rect x="-18" y="-32" width="36" height="64" rx="7" fill="#26262c" stroke="${K}" stroke-width="5"/><rect x="-13" y="-24" width="26" height="44" rx="3" fill="#7cc4f0"/><path d="M -2 -10 C -10 -16 -14 -4 -2 4 C 10 -4 6 -16 -2 -10 Z" fill="#e0362b"/></g>`
};

const FX = {
  sweat: `<path d="M 74 -112 C 64 -94 66 -84 76 -84 C 86 -84 88 -94 74 -112 Z" fill="#7cc4f0" stroke="#2f6f9c" stroke-width="3"/>`,
  hearts: `<g fill="#e0362b" stroke="${K}" stroke-width="3.5"><path d="M 98 -112 C 82 -122 86 -138 98 -130 C 110 -138 114 -122 98 -112 Z"/><path d="M -104 -96 C -116 -104 -113 -116 -104 -110 C -95 -116 -92 -104 -104 -96 Z"/></g>`,
  zzz: `<g class="en" font-family="RubikDirt" fill="#fff6e2" stroke="${K}" stroke-width="6" paint-order="stroke" font-size="34"><text x="70" y="-110">Z</text><text x="96" y="-136" font-size="26">z</text><text x="114" y="-156" font-size="20">z</text></g>`,
  stars: `<g fill="#ffd86b" stroke="${K}" stroke-width="3">${[[92, -118], [-98, -104], [110, -70]].map(([x, y]) => `<path d="M ${x} ${y - 14} L ${x + 4} ${y - 4} L ${x + 14} ${y} L ${x + 4} ${y + 4} L ${x} ${y + 14} L ${x - 4} ${y + 4} L ${x - 14} ${y} L ${x - 4} ${y - 4} Z"/>`).join('')}</g>`,
  mud: `<g fill="#6b4228" stroke="${K}" stroke-width="2.5"><circle cx="-30" cy="-30" r="7"/><circle cx="40" cy="-90" r="5"/><circle cx="-30" cy="60" r="10"/><circle cx="24" cy="86" r="8"/><circle cx="-56" cy="96" r="6"/><circle cx="56" cy="40" r="7"/></g>`,
  rain: `<g><path d="M -100 -122 C -120 -122 -120 -150 -96 -150 C -92 -170 -60 -172 -50 -152 C -30 -164 -6 -150 -14 -130 C 4 -128 2 -112 -16 -112 L -96 -112 Z" fill="#e9dcc0" stroke="${K}" stroke-width="5"/><path d="M -84 -100 l -6 16 M -60 -100 l -6 16 M -36 -100 l -6 16" stroke="#3a7fc0" stroke-width="6" stroke-linecap="round"/></g>`,
  question: `<text x="88" y="-100" font-family="Lalezar" font-size="70" fill="url(#orange)" stroke="${K}" stroke-width="8" paint-order="stroke">؟</text>`,
  exclaim: `<text x="92" y="-96" font-family="Lalezar" font-size="70" fill="url(#orange)" stroke="${K}" stroke-width="8" paint-order="stroke">!</text>`,
  fire: `<g transform="translate(-104 -100) scale(0.55)"><path d="M 0 -110 C 40 -60 70 -30 60 20 C 55 50 30 64 0 64 C -30 64 -55 50 -60 20 C -66 -20 -36 -40 -30 -80 C -10 -60 -6 -40 0 -110 Z" fill="url(#fire)" stroke="#5a1f0a" stroke-width="10"/></g>`
};

function character({ eyes = 'normal', brows = 'none', mouth = 'smile', arms = 'down', prop, fx = [], blush = true }) {
  const [L, R] = ARM_POS[arms];
  const backProp = prop === 'umbrella' || prop === 'flag' || prop === 'torch' || prop === 'axe';
  const propSvg = prop ? (PROPS[prop](R[0], R[1])) : '';
  let rightHand = '';
  if (arms === 'thumb') rightHand = thumbUp(R[0], R[1]);
  if (arms === 'point') rightHand = finger(R[0], R[1]);
  const legs = `<rect x="-38" y="96" width="28" height="30" rx="6" fill="#5a3418" stroke="${K}" stroke-width="6"/><rect x="10" y="96" width="28" height="30" rx="6" fill="#5a3418" stroke="${K}" stroke-width="6"/>
    <path d="M -46 118 L -6 118 L -6 132 L -50 132 C -54 132 -54 120 -46 118 Z" fill="#2e1a0c"/><path d="M 46 118 L 6 118 L 6 132 L 50 132 C 54 132 54 120 46 118 Z" fill="#2e1a0c"/>`;
  const body = `<path d="M -52 8 C -52 -6 52 -6 52 8 L 62 104 L -62 104 Z" fill="url(#${CUR.tunic})" stroke="${K}" stroke-width="7" stroke-linejoin="round"/>
    <rect x="-60" y="62" width="120" height="16" rx="5" fill="#5a3418" stroke="${K}" stroke-width="5"/><rect x="-12" y="60" width="24" height="20" rx="4" fill="#f7b65c" stroke="${K}" stroke-width="4"/>
    <path d="M -54 6 C -44 -8 -30 4 -18 -6 C -6 6 6 6 18 -6 C 30 4 44 -8 54 6 C 50 20 -50 20 -54 6 Z" fill="#efe2c4" stroke="${K}" stroke-width="5" stroke-linejoin="round"/>`;
  const head = `<circle cx="-70" cy="-58" r="12" fill="${SKIN}" stroke="${K}" stroke-width="5"/><circle cx="70" cy="-58" r="12" fill="${SKIN}" stroke="${K}" stroke-width="5"/>
    <circle cx="0" cy="-60" r="70" fill="${SKIN}" stroke="${K}" stroke-width="7"/>
    ${blush ? `<ellipse cx="-44" cy="-40" rx="11" ry="6" fill="#f08a7a" opacity="0.6"/><ellipse cx="44" cy="-40" rx="11" ry="6" fill="#f08a7a" opacity="0.6"/>` : ''}
    <path d="M -64 -44 C -72 18 -36 58 0 64 C 36 58 72 18 64 -44 C 46 -22 22 -26 0 -24 C -22 -26 -46 -22 -64 -44 Z" fill="url(#beard)" stroke="${K}" stroke-width="6" stroke-linejoin="round"/>
    <path d="M -14 34 L -10 64 M 14 34 L 10 64" stroke="#9c4a17" stroke-width="5" stroke-linecap="round"/>
    <g transform="translate(0 2)">${MOUTHS[mouth]}</g>
    <path d="M -2 -30 C -18 -34 -40 -28 -44 -12 C -30 -20 -14 -18 -2 -22 Z M 2 -30 C 18 -34 40 -28 44 -12 C 30 -20 14 -18 2 -22 Z" fill="#c05f20" stroke="${K}" stroke-width="4" stroke-linejoin="round"/>
    <ellipse cx="0" cy="-38" rx="14" ry="11" fill="#e8a07a" stroke="${K}" stroke-width="4"/>
    ${EYES[eyes]}${BROWS[brows]}
    <path d="M -96 -92 C -138 -110 -140 -160 -116 -184 C -112 -150 -94 -128 -66 -118 Z" fill="#efe2c4" stroke="${K}" stroke-width="7" stroke-linejoin="round"/>
    <path d="M 96 -92 C 138 -110 140 -160 116 -184 C 112 -150 94 -128 66 -118 Z" fill="#efe2c4" stroke="${K}" stroke-width="7" stroke-linejoin="round"/>
    <path d="M -76 -86 C -76 -164 76 -164 76 -86 Z" fill="url(#steel)" stroke="${K}" stroke-width="7"/>
    <rect x="-82" y="-96" width="164" height="20" rx="7" fill="#b06a2f" stroke="${K}" stroke-width="6"/>
    <rect x="-9" y="-150" width="18" height="62" rx="5" fill="#b06a2f" stroke="${K}" stroke-width="5"/>
    <circle cx="-50" cy="-86" r="4" fill="${K}"/><circle cx="50" cy="-86" r="4" fill="${K}"/>`;
  const fistUp = arms === 'up' || arms === 'raise';
  return `${backProp ? propSvg : ''}${legs}${arm(-1, L, fistUp)}${body}${arm(1, R, fistUp)}${rightHand}${head}${!backProp ? propSvg : ''}${fx.map(f => FX[f]).join('')}`;
}


// ---- additions for the pro packs ----
EYES.dizzy = `<g fill="none" stroke="${K}" stroke-width="4.5" stroke-linecap="round">${[-1, 1].map(s => `<circle cx="${24 * s}" cy="-64" r="13" fill="#fff"/><path d="M ${24 * s} -64 m 0 -9 a 9 9 0 1 1 -8 5 a 6 6 0 1 1 5 -3 a 3 3 0 1 1 3 0"/>`).join('')}</g>`;
EYES.shy = `<g fill="none" stroke="${K}" stroke-width="6" stroke-linecap="round">${[-1, 1].map(s => `<path d="M ${24 * s - 10} -62 Q ${24 * s} -56 ${24 * s + 10} -62"/>`).join('')}</g><g fill="#f0657a" opacity="0.75"><ellipse cx="-44" cy="-40" rx="16" ry="9"/><ellipse cx="44" cy="-40" rx="16" ry="9"/></g>`;
FX.anger = `<g transform="translate(78 -112)" stroke="#d81f1f" stroke-width="7" stroke-linecap="round" fill="none"><path d="M -14 -4 Q -4 -4 -4 -14"/><path d="M 14 -4 Q 4 -4 4 -14"/><path d="M -14 4 Q -4 4 -4 14"/><path d="M 14 4 Q 4 4 4 14"/></g>`;
FX.laughtears = `<g fill="#7cc4f0" stroke="#2f6f9c" stroke-width="3">${[-1, 1].map(s => `<path d="M ${50 * s} -60 C ${70 * s} -52 ${78 * s} -40 ${70 * s} -32 C ${62 * s} -26 ${54 * s} -40 ${50 * s} -60 Z"/>`).join('')}</g>`;
FX.speed = `<g stroke="${K}" stroke-width="7" stroke-linecap="round">${[[-150, -40, -110], [-160, 0, -118], [-150, 40, -110], [-140, 80, -104]].map(([x1, y, x2]) => `<path d="M ${x1} ${y} L ${x2} ${y}"/>`).join('')}</g>`;
FX.steam = `<g fill="#f4f4f4" stroke="${K}" stroke-width="4">${[[-60, -170, 18], [-34, -190, 14], [60, -168, 18], [86, -186, 13]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>`;
FX.cold = `<g stroke="#5fb8ec" stroke-width="5" stroke-linecap="round" fill="none">${[[-110, -100], [110, -90], [-118, 20]].map(([x, y]) => `<g transform="translate(${x} ${y})"><path d="M 0 -16 L 0 16 M -14 -8 L 14 8 M -14 8 L 14 -8"/></g>`).join('')}</g><path d="M -30 -6 l 6 8 l 6 -8 l 6 8 l 6 -8 l 6 8 l 6 -8 l 6 8 l 6 -8" fill="none" stroke="#5fb8ec" stroke-width="4"/>`;
FX.music = `<g fill="${K}">${[[-112, -110], [104, -130], [120, -60]].map(([x, y]) => `<g transform="translate(${x} ${y})"><ellipse cx="0" cy="18" rx="10" ry="8"/><rect x="7" y="-14" width="5" height="32"/><path d="M 12 -14 Q 26 -8 22 4" stroke="${K}" stroke-width="5" fill="none"/></g>`).join('')}</g>`;
