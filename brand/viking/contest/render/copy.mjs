// Copy for the Autumn Escape contest set: one 3-slide post and eight Stories (2 per day × 4 days).
//
// Conventions encoded here deliberately:
//  • No location. Not the province, the forest, the lake, the village or the region — and that
//    includes the destination the *reference* campaign named in its title. The owner's brief is
//    explicit that travellers' safety comes first, so the campaign is named «پاییز وایکینگ» and the
//    DM keyword is «پاییز». tests/copy.test.mjs fails the build if a place name appears anywhere.
//  • Prices and dates come from the owner's brief, never from the reference images. The reference
//    campaign's numbers (7 million, 26 Mehr, 1 Aban, free-trip giveaway) are NOT reused.
//  • The brief never states the currency unit, so prices print as bare figures and
//    `currencyPending: true` records that. Do not invent «تومان».
//  • No scarcity is claimed that the owner did not state, with one exception: `capacityClaim` is a
//    proposed line held OFF the artwork until it is approved (see PENDING in the README).
//
// Story arc: day 1 announce → day 2 what it is → day 3 what it costs/entails → day 4 close.

export const campaign = {
  name: 'پاییز وایکینگ',
  latinName: 'AUTUMN ESCAPE',
  dates: { leave: '۵ آذر', back: '۶ آذر' },
  priceSelf: '۷٬۵۰۰٬۰۰۰',
  priceGroupExtra: '۲٬۵۰۰٬۰۰۰',
  pays: 'پذیرایی فول‌برد: صبحانه، ناهار، شام',
  roomsValue: '۴ تا ۵ نفره',
  roomsUnit: 'گن‌خواب',
  captionLimit: '۳ مهر',
  drawDate: '۲۶ مهر',
  prize: 'یک نفر، تمام سفر رایگان',
  currencyPending: true,
  contact: {
    hesam: { label: 'حسام', phone: '0912 333 1540' },
    mahyar: { label: 'مهیار', phone: '0935 555 0774' },
  },
  follow: '@viking.offroad',
};

/** Slide 1 — hook, title, travel dates. */
export const post1 = {
  tape: 'قرعه‌کشی سفر رایگان، پاییز وایکینگ',
  latin: campaign.latinName,
  title: campaign.name,
  sub: 'دو روز جنگل، آتش و آدم‌های تازه',
  dateA: { label: 'شروع سفر', value: campaign.dates.leave },
  dateB: { label: 'پایان سفر', value: campaign.dates.back },
};

/** Slide 2 — what the trip actually contains (6 cards + the catering bar). */
export const post2 = {
  tape: 'برنامهٔ سفر / اقامت و پذیرایی',
  rooms: `${campaign.roomsValue} ، ${campaign.roomsUnit}`,
  cards: [
    { icon: 'cinema', title: 'سینما کمپ', sub: 'فیلم در دل طبیعت' },
    { icon: 'fire', title: 'شب‌نشینی', sub: 'دور آتیش' },
    { icon: 'music', title: 'موسیقی زنده', sub: 'اجرای زنده در سفر' },
    { icon: 'forest', title: 'جنگل‌گردی', sub: 'میان رنگ‌های پاییزی' },
    { icon: 'paddle', title: 'گشت کنار رودخانه', sub: 'قدم‌زدن در طبیعت' },
    { icon: 'home', title: 'اقامت سنتی', sub: 'یک شب در دل جنگل' },
  ],
  paysLead: 'پذیرایی فول‌برد',
  paysSub: 'صبحانه، ناهار و شام، سلف‌سرویس',
  strip: 'از قدم‌زدن کنار رودخانه تا شب‌نشینی دور آتیش',
};

/** Slide 3 — cost, cancellation terms, two phone numbers. */
export const post3 = {
  tape: 'شرایط سفر / هزینه',
  title: 'با ماشین خودت یا با گروه',
  sub: 'شرکت با هر نوع خودرو امکان‌پذیر',
  colA: { label: 'با خودروی شخصی', value: campaign.priceSelf },
  colB: { label: 'هزینهٔ اضافهٔ خودروی گروه', value: campaign.priceGroupExtra },
  unitNote: 'واحد قیمت در متن اولیه مشخص نشده',
  condTitle: 'شرایط کنسلی',
  condBody: 'در صورت بروز شرایط اضطراری در کشور، کل وجه سفر برمی‌گردد.',
  cta: 'برای ددرو «پاییز» دو دایرکت کن',
  phones: [
    { label: campaign.contact.mahyar.label, phone: campaign.contact.mahyar.phone },
    { label: campaign.contact.hesam.label, phone: campaign.contact.hesam.phone },
  ],
  strip: 'VIKING OFFROAD / AUTUMN ESCAPE',
};

/**
 * Eight Stories, two per day for four days.
 * `slot` prints as ۱/۸ … ۸/۸; `day` is the publish day for scheduling.
 */
export const stories = [
  // ── Day 1 — the announcement ────────────────────────────────────────────────────────────────
  {
    id: 'story-1',
    day: 1,
    slot: 1,
    kicker: 'قرعه‌کشی سفر رایگان',
    title: campaign.name,
    sub: 'دو روز جنگل، آتش و آدم‌های تازه',
    body: null,
    steps: null,
    cards: null,
    contacts: null,
    noteCards: [
      { iconName: 'gift', title: 'برای برنده', text: 'یک نفر تمام سفر را رایگان می‌رود: اقامت، پذیرایی و برنامهٔ کامل.' },
    ],
    dates: [
      { label: 'شروع سفر', value: campaign.dates.leave },
      { label: 'پایان سفر', value: campaign.dates.back },
    ],
    strip: 'قرعه‌کشی سفر رایگان، پاییز وایکینگ',
    photo: 'story-1-lake.jpg',
    focus: 0.5,
    bloom: 'warm',
    scrim: [[0, 0.66], [0.16, 0.18], [0.32, 0.1], [0.46, 0.42], [0.58, 0.72], [0.72, 0.86], [1, 0.95]],
  },
  {
    id: 'story-2',
    day: 1,
    slot: 2,
    kicker: 'قرعه‌کشی سفر رایگان',
    head: 'رایگان',
    title: campaign.name,
    sub: campaign.prize,
    body: null,
    steps: [
      { icon: 'plus', title: 'فالو کن', sub: campaign.follow, dir: 'ltr' },
      { icon: 'repair', title: 'ری‌پست کن', sub: 'پست آخر رو' },
      { icon: 'people', title: '۵ نفر رو تگ کن', sub: 'زیر همون پست' },
    ],
    cards: null,
    contacts: null,
    noteCards: null,
    dates: [
      { label: 'ددلاین', value: campaign.captionLimit },
      { label: 'قرعه‌کشی', value: campaign.drawDate },
    ],
    strip: 'فقط تا مهر وقت داری، از دستش نده',
    photo: 'story-2-fire.jpg',
    focus: 0.58,
    zoom: 1.08,
    veil: 0.12,
    bloom: 'ember',
    scrim: [[0, 0.72], [0.14, 0.24], [0.3, 0.2], [0.44, 0.5], [0.58, 0.8], [0.74, 0.92], [1, 0.97]],
  },

  // ── Day 2 — what it is ──────────────────────────────────────────────────────────────────────
  {
    id: 'story-3',
    day: 2,
    slot: 3,
    kicker: 'برنامهٔ سفر',
    title: 'شب تا صبح، جنگل',
    sub: null,
    body: 'سینما کمپ، موسیقی زنده، شب‌نشینی دور آتیش و جنگل‌گردی میان رنگ‌های پاییزی.',
    steps: null,
    cards: null,
    contacts: null,
    noteCards: [
      { iconName: 'clock', title: 'برنامهٔ سفر', text: 'روز اول حرکت، جنگل‌گردی و شب‌نشینی؛ روز دوم گشت کنار رودخانه و برگشت.' },
    ],
    dates: [
      { label: 'شروع سفر', value: campaign.dates.leave },
      { label: 'پایان سفر', value: campaign.dates.back },
    ],
    strip: 'از قدم‌زدن کنار رودخانه تا شب‌نشینی دور آتیش',
    photo: 'story-3-ridge.jpg',
    focus: 0.42,
    bloom: 'warm',
    scrim: [[0, 0.68], [0.18, 0.2], [0.34, 0.14], [0.5, 0.46], [0.66, 0.82], [0.82, 0.93], [1, 0.96]],
  },
  {
    id: 'story-4',
    day: 2,
    slot: 4,
    kicker: 'اقامت و پذیرایی',
    title: 'اتاق‌های ۴ تا ۵ نفره',
    sub: campaign.roomsUnit,
    body: 'یک شب اقامت و پذیرایی کامل، از صبحانه تا شام.',
    steps: null,
    cards: [
      { icon: 'plate', title: 'پذیرایی فول‌برد', sub: 'صبحانه / ناهار / شام' },
      { icon: 'home', title: 'اقامت سنتی', sub: 'گن‌خواب در دل جنگل' },
    ],
    contacts: null,
    noteCards: null,
    dates: [
      { label: 'شروع سفر', value: campaign.dates.leave },
      { label: 'پایان سفر', value: campaign.dates.back },
    ],
    strip: 'همه‌چیز از قبل هماهنگ شده',
    photo: 'story-4-table.jpg',
    focus: 0.58,
    bloom: 'ember',
    scrim: [[0, 0.7], [0.16, 0.22], [0.34, 0.2], [0.5, 0.52], [0.66, 0.84], [0.82, 0.93], [1, 0.96]],
  },

  // ── Day 3 — what it costs and what you agree to ─────────────────────────────────────────────
  {
    id: 'story-5',
    day: 3,
    slot: 5,
    kicker: 'شرایط سفر / هزینه',
    title: 'با ماشین خودت یا با گروه',
    sub: 'شرکت با هر نوع خودرو امکان‌پذیر',
    body: null,
    steps: null,
    cards: [
      { icon: 'car', title: 'با خودروی شخصی', sub: campaign.priceSelf, key: 'figure' },
      { icon: 'people', title: 'هزینهٔ اضافهٔ خودروی گروه', sub: campaign.priceGroupExtra, key: 'figure' },
    ],
    contacts: null,
    noteCards: [
      { iconName: 'clock', text: 'واحد قیمت در متن اولیه مشخص نشده است؛ پیش از انتشار واحد را در کپشن بنویس.' },
    ],
    dates: null,
    strip: 'هزینه‌ها شفاف اعلام شده',
    photo: 'story-5-road.jpg',
    focus: 0.44,
    zoom: 1.12,
    scrim: [[0, 0.74], [0.16, 0.26], [0.32, 0.24], [0.48, 0.56], [0.64, 0.86], [0.8, 0.94], [1, 0.97]],
  },
  {
    id: 'story-6',
    day: 3,
    slot: 6,
    kicker: 'قبل از ثبت‌نام بخون',
    title: 'شرایط کنسلی',
    sub: null,
    body: null,
    steps: null,
    cards: null,
    contacts: null,
    noteCards: [
      {
        iconName: 'shield',
        title: 'شرایط کنسلی',
        text: 'در صورت بروز شرایط اضطراری در کشور، کل وجه سفر برمی‌گردد.',
      },
      {
        iconName: 'people',
        title: 'شرکت با هر خودرو',
        text: 'با خودروی شخصی یا خودروی گروه؛ هر کدام راحت‌تر بود، همان را انتخاب کن.',
      },
    ],
    dates: [
      { label: 'شروع سفر', value: campaign.dates.leave },
      { label: 'پایان سفر', value: campaign.dates.back },
    ],
    strip: 'شرایط اضطراری، بازگشت کل وجه',
    photo: 'post-3-night.jpg',
    focus: 0.62,
    zoom: 1.14,
    bloom: 'ember',
    scrim: [[0, 0.88], [0.2, 0.66], [0.42, 0.6], [0.6, 0.78], [0.78, 0.92], [1, 0.97]],
  },

  // ── Day 4 — close ───────────────────────────────────────────────────────────────────────────
  {
    id: 'story-7',
    day: 4,
    slot: 7,
    kicker: 'آخرین روز قرعه‌کشی',
    head: 'رایگان',
    title: 'جات هست؟',
    sub: null,
    body: 'فالو کن، پست آخر را ری‌پست کن و ۵ نفر را تگ کن؛ برندهٔ قرعه‌کشی بدون هزینه می‌آید.',
    steps: null,
    cards: null,
    contacts: null,
    noteCards: null,
    dates: [
      { label: 'ددلاین', value: campaign.captionLimit },
      { label: 'قرعه‌کشی', value: campaign.drawDate },
    ],
    strip: 'فقط تا مهر وقت داری، از دستش نده',
    photo: 'post-1-hero.jpg',
    focus: 0.38,
    zoom: 1.05,
    scrim: [[0, 0.72], [0.16, 0.24], [0.32, 0.2], [0.46, 0.52], [0.6, 0.8], [0.76, 0.92], [1, 0.96]],
  },
  {
    id: 'story-8',
    day: 4,
    slot: 8,
    kicker: 'ثبت‌نام',
    title: 'دو دایرکت کن',
    sub: 'برای ددرو «پاییز»',
    body: null,
    steps: null,
    cards: null,
    contacts: [
      { icon: 'whatsapp', label: campaign.contact.hesam.label, sub: campaign.contact.hesam.phone },
      { icon: 'whatsapp', label: campaign.contact.mahyar.label, sub: campaign.contact.mahyar.phone },
    ],
    noteCards: null,
    dates: [
      { label: 'شروع سفر', value: campaign.dates.leave },
      { label: 'پایان سفر', value: campaign.dates.back },
    ],
    strip: 'رزرو از لینک بیو، فقط تا مهر',
    photo: 'story-6-invite.jpg',
    focus: 0.5,
    veil: 0.16,
    bloom: 'ember',
    scrim: [[0, 0.76], [0.16, 0.32], [0.3, 0.3], [0.44, 0.62], [0.58, 0.88], [0.74, 0.94], [1, 0.97]],
  },
];

/** Lines that need the owner's approval before they can be printed. */
export const pending = [
  {
    key: 'capacityClaim',
    proposed: 'ظرفیت محدود',
    reason: 'A scarcity line is only honest if the owner confirms a number or a real ceiling.',
  },
  {
    key: 'currency',
    reason: 'The brief gives ۷٬۵۰۰٬۰۰۰ and ۲٬۵۰۰٬۰۰۰ with no unit; print «تومان» only after confirmation.',
  },
];
