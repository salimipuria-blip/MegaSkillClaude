// Single source of truth for Viking Offroad image-generation and photo-editing art direction.
// The image model creates/edits pixels only; exact Persian copy, the official logo and layout belong
// to the real-font / approved-template layer, never to diffusion-generated lettering.

const fold = (value) => String(value || '')
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[\u064a\u0649]/g, 'ی')
  .replace(/\u0643/g, 'ک')
  .replace(/[\u200c\u200e\u200f\u2060]/g, ' ')
  .replace(/[\u064b-\u065f\u0640]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const STORY = /(?:استوری|ریلز|\b(?:instagram\s+)?(?:story|stories)\b|\breels?\b|9\s*[:x×/]\s*16)/iu;
const POST = /(?:کاروسل|پست(?:\s*(?:اینستا(?:گرام)?|اینستاگرام|فید))?|\b(?:instagram\s+)?(?:feed\s+)?posts?\b|\bcarousel\b|4\s*[:x×/]\s*5)/iu;
const VIKING = /(?:وایکینگ|viking|آفرود|off\s*[- ]?road|کمپ|کمپینگ|تور|پدل|دریاچه|جنگل هیرکانی|طبیعت\s*گردی|adventure\s*tour|paddleboard)/iu;
const SOCIAL_CREATIVE = /(?:پست|استوری|کاروسل|ریلز|اینستا(?:گرام)?|پوستر|کمپین|تبلیغ|\b(?:instagram|social|carousel|poster|campaign|ad creative)\b)/iu;
const REFERENCE_STYLE = /(?:مثل|شبیه|همین\s*سبک|این\s*سبک|رفرنس|نمونه|استایل|قالب|visual\s*reference|reference\s*style|like\s+(?:this|that|these\s+examples|those\s+examples|the\s+reference))/iu;

export const VIKING_PALETTE = Object.freeze({
  orange: '#F39A2B',
  black: '#141414',
  cream: '#FFD9A8',
  alert: '#FF4D3D',
  white: '#FFFFFF',
});

/** The requested Instagram output format, or null when the message does not specify one. */
export function vikingFormat(text) {
  const value = fold(text);
  if (STORY.test(value)) return 'story';
  if (POST.test(value)) return 'post';
  return null;
}

/**
 * Image requests use the Viking look for explicit Viking/outdoor content and social creatives.
 * In this private assistant, an otherwise-unspecified Instagram post/story defaults to Viking.
 */
export function isVikingImageRequest(text) {
  const value = fold(text);
  return VIKING.test(value) || SOCIAL_CREATIVE.test(value);
}

/** Photo edits need a brand cue or an explicit request to copy the reference look. */
export function isVikingStyleEdit(text) {
  const value = fold(text);
  return !!(VIKING.test(value) || REFERENCE_STYLE.test(value));
}

const framing = (format) => {
  if (format === 'story') return 'Portrait 9:16 Story; hero lower-middle, central 84% safe, top and bottom kept calm.';
  if (format === 'post') return 'Portrait 4:5 carousel; hero middle-lower, calm dark top and lower-third space for type.';
  return 'Portrait-friendly composition, clear hero subject and uncluttered space for later type.';
};

const CINEMATIC_QUALITY = 'Photorealistic AI-generated live-action photography, cinematic feature-film still, physically plausible camera optics and lighting, nuanced natural HDR, crisp fine textures without over-sharpening; request 8K-like microdetail at the highest native resolution the model supports, not illustration or obvious CGI.';

/** English direction appended to an image-model prompt for reliable, brand-specific pixels. */
export function vikingImageDirection(text) {
  if (!isVikingImageRequest(text)) return '';
  const format = vikingFormat(text);
  return [
    'Viking Offroad is a modern Iranian brand, not Norse fantasy.',
    CINEMATIC_QUALITY,
    'Match the supplied references’ photo mood: full-bleed forest lake when relevant, low amber sunrise, light mist and water reflection, deep forest-green edges, near-black lower text-safe area; keep the grade natural.',
    framing(format),
    'Keep the requested subject and count; add a paddleboarder, vehicle, tent or fire only when the brief asks for it. Invent no campaign facts.',
    'Photo background only: no text, letters, numbers, logo, watermark, ribbons, cards, badges, UI or emoji. Leave calm negative space; Persian copy and official logo are composed later with real assets.',
    'Avoid distortion, oversaturation and crushed blacks.',
  ].join(' ');
}

/** Editing direction for a user-supplied photo; deliberately preserves the source photograph. */
export function vikingEditDirection(text) {
  if (!isVikingStyleEdit(text)) return '';
  const format = vikingFormat(text);
  return [
    'Viking Offroad edit: apply the supplied references’ treatment without changing the source scene—low amber sunrise, fine mist where plausible, deep natural-green shadows and restrained warm highlights; preserve water reflections only when present.',
    CINEMATIC_QUALITY,
    framing(format),
    'Preserve people/identity, pose, vehicle/equipment count, perspective and genuine visible brand marks; invent no props or campaign facts.',
    'Reframe or outpaint naturally; never stretch, distort faces or crop essential subjects.',
    'No generated text, numbers, logos, ribbons, cards, badges or watermarks; compose approved copy and logo separately with real fonts/assets.',
  ].join(' ');
}
