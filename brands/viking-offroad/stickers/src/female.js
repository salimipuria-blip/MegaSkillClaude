// Female Viking (shieldmaiden): auburn braids, winged helmet, orange dress.
const HAIR = '#8a3b12';
const HAIR_D = '#5e2408';

function braid(side) {
  const x0 = 62 * side;
  let s = '';
  for (let i = 0; i < 6; i++) {
    const y = -36 + i * 20;
    const x = x0 + side * (i * 2.5);
    s += `<ellipse cx="${x}" cy="${y}" rx="${15 - i}" ry="13" fill="${HAIR}" stroke="${K}" stroke-width="5"/>`;
  }
  s += `<path d="M ${x0 + side * 14} 82 l ${-side * 8} 0" stroke="#f7b65c" stroke-width="9" stroke-linecap="round"/>`;
  s += `<path d="M ${x0 + side * 8} 84 C ${x0 + side * 20} 96 ${x0 + side * 4} 104 ${x0 + side * 14} 112" fill="none" stroke="${HAIR}" stroke-width="10" stroke-linecap="round"/>`;
  return s;
}

const LASHES = `<g stroke="${K}" stroke-width="4" stroke-linecap="round">${[-1, 1].map(s => `<path d="M ${24 * s + 9 * s} -74 l ${7 * s} -6 M ${24 * s + 4 * s} -77 l ${4 * s} -8"/>`).join('')}</g>`;

function characterF({ eyes = 'normal', brows = 'none', mouth = 'smile', arms = 'down', prop, fx = [] }) {
  CUR.sleeve = '#e07a26'; CUR.tunic = 'dressF';
  const [L, R] = ARM_POS[arms];
  const backProp = prop === 'umbrella' || prop === 'flag' || prop === 'torch' || prop === 'axe';
  const propSvg = prop ? PROPS[prop](R[0], R[1]) : '';
  let rightHand = '';
  if (arms === 'thumb') rightHand = thumbUp(R[0], R[1]);
  if (arms === 'point') rightHand = finger(R[0], R[1]);
  const legs = `<rect x="-30" y="104" width="22" height="22" rx="6" fill="${SKIN}" stroke="${K}" stroke-width="5"/><rect x="8" y="104" width="22" height="22" rx="6" fill="${SKIN}" stroke="${K}" stroke-width="5"/>
    <path d="M -38 118 L -4 118 L -4 132 L -42 132 C -46 132 -46 120 -38 118 Z" fill="#5a3418"/><path d="M 38 118 L 4 118 L 4 132 L 42 132 C 46 132 46 120 38 118 Z" fill="#5a3418"/>`;
  const body = `<path d="M -46 8 C -46 -6 46 -6 46 8 L 70 110 L -70 110 Z" fill="url(#dressF)" stroke="${K}" stroke-width="7" stroke-linejoin="round"/>
    <path d="M -64 92 L 64 92" stroke="#b8541c" stroke-width="6"/>
    <rect x="-50" y="56" width="100" height="14" rx="5" fill="#5a3418" stroke="${K}" stroke-width="5"/><circle cx="0" cy="63" r="10" fill="#f7d25c" stroke="${K}" stroke-width="4"/>
    <path d="M -50 6 C -40 -8 -26 4 -14 -6 C -4 6 4 6 14 -6 C 26 4 40 -8 50 6 C 46 20 -46 20 -50 6 Z" fill="#efe2c4" stroke="${K}" stroke-width="5" stroke-linejoin="round"/>`;
  const head = `
    <path d="M -80 -60 C -84 -150 84 -150 80 -60 C 82 -20 70 0 56 6 L -56 6 C -70 0 -82 -20 -80 -60 Z" fill="${HAIR}" stroke="${K}" stroke-width="7" stroke-linejoin="round"/>
    ${braid(-1)}${braid(1)}
    <circle cx="-68" cy="-52" r="11" fill="${SKIN}" stroke="${K}" stroke-width="5"/><circle cx="68" cy="-52" r="11" fill="${SKIN}" stroke="${K}" stroke-width="5"/>
    <circle cx="-70" cy="-36" r="6" fill="#f7d25c" stroke="${K}" stroke-width="3"/><circle cx="70" cy="-36" r="6" fill="#f7d25c" stroke="${K}" stroke-width="3"/>
    <circle cx="0" cy="-56" r="66" fill="${SKIN}" stroke="${K}" stroke-width="7"/>
    <ellipse cx="-42" cy="-34" rx="12" ry="7" fill="#f08a7a" opacity="0.65"/><ellipse cx="42" cy="-34" rx="12" ry="7" fill="#f08a7a" opacity="0.65"/>
    <path d="M -66 -78 C -50 -60 -24 -66 -6 -86 C 6 -66 40 -62 66 -78 L 66 -100 L -66 -100 Z" fill="${HAIR}" stroke="${K}" stroke-width="6" stroke-linejoin="round"/>
    <g transform="translate(0 4)">${MOUTHS[mouth].replace(/#5a1f0a/g, '#a8321e')}</g>
    <path d="M -4 -36 C -2 -30 2 -30 4 -36" fill="none" stroke="#c97a5a" stroke-width="4" stroke-linecap="round"/>
    ${eyes === 'cool' ? '' : LASHES}${EYES[eyes]}${BROWS[brows].replace(/#8a3d12/g, HAIR_D).replace(/stroke-width="(7|8)"/g, 'stroke-width="5"')}
    <path d="M -72 -96 C -110 -110 -128 -150 -108 -170 C -96 -146 -84 -136 -60 -126 C -88 -138 -100 -128 -92 -114 Z" fill="#fff6e2" stroke="${K}" stroke-width="6" stroke-linejoin="round"/>
    <path d="M 72 -96 C 110 -110 128 -150 108 -170 C 96 -146 84 -136 60 -126 C 88 -138 100 -128 92 -114 Z" fill="#fff6e2" stroke="${K}" stroke-width="6" stroke-linejoin="round"/>
    <path d="M -66 -98 C -66 -160 66 -160 66 -98 Z" fill="url(#steel)" stroke="${K}" stroke-width="7"/>
    <rect x="-72" y="-106" width="144" height="18" rx="7" fill="#e07a26" stroke="${K}" stroke-width="6"/>
    <circle cx="0" cy="-97" r="8" fill="#f7d25c" stroke="${K}" stroke-width="4"/>`;
  const fistUp = arms === 'up' || arms === 'raise';
  const out = `${backProp ? propSvg : ''}${legs}${arm(-1, L, fistUp)}${body}${arm(1, R, fistUp)}${rightHand}${head}${!backProp ? propSvg : ''}${fx.map(f => FX[f]).join('')}`;
  CUR.sleeve = '#8a4a1c'; CUR.tunic = 'tunicM';
  return out;
}
