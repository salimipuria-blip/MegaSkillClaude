// Two-character dialogues per pack. [speaker of first line ('m'|'f'), first line, opts, reply, opts]
// "_" = نیم‌فاصله
const DUOS = [
  [ // 01 سلام و علیک
    ['m', 'سلام خانوم!', { e: 'happy', m: 'grin', a: 'wave' }, 'علیک سلام آقا!', { e: 'wink', m: 'smile', a: 'wave' }],
    ['f', 'کجایی تو؟', { e: 'normal', b: 'angry', m: 'o', a: 'point' }, 'همین_جام بابا!', { e: 'happy', m: 'grin', a: 'shrug' }],
    ['m', 'صبح بخیر', { e: 'sleepy', m: 'smile', a: 'hold', p: 'mug' }, 'ظهره داداش!', { e: 'laugh', m: 'grin', a: 'point' }],
    ['f', 'خوبی؟', { e: 'happy', m: 'smile', a: 'chin' }, 'مگه می_شه بد باشم؟', { e: 'cool', m: 'grin', a: 'thumb' }],
    ['m', 'شب بخیر', { e: 'sleepy', m: 'sleep', a: 'wave' }, 'کو تا شب!', { e: 'normal', b: 'raised', m: 'smirk', a: 'point' }],
    ['f', 'دلم برات تنگ شده', { e: 'love', m: 'smile', a: 'down' }, 'منم، به جون تو!', { e: 'love', m: 'grin', a: 'down' }]
  ],
  [ // 02 ری‌اکشن
    ['m', 'دیدی چی شد؟', { e: 'shocked', b: 'up', m: 'o', a: 'point' }, 'کف کردم!', { e: 'shocked', b: 'up', m: 'o', a: 'up' }],
    ['f', 'جدی می_گی؟', { e: 'normal', b: 'raised', m: 'o', a: 'chin' }, 'به جون خودم!', { e: 'normal', b: 'up', m: 'grin', a: 'up' }],
    ['m', 'باورم نمی_شه', { e: 'dizzy', m: 'o', a: 'down' }, 'منم هنگ کردم', { e: 'dizzy', m: 'o', a: 'down' }],
    ['f', 'خیلی باحال بود!', { e: 'happy', m: 'grin', a: 'up' }, 'ترکوندیم!', { e: 'cool', m: 'grin', a: 'thumb' }],
    ['m', 'عصبانی شدی؟', { e: 'normal', b: 'sad', m: 'grit', a: 'chin' }, 'نه… فقط یه کم!', { e: 'normal', b: 'angry', m: 'grit', a: 'shrug', f: ['anger'] }],
    ['f', 'بخند دیگه!', { e: 'happy', m: 'grin', a: 'point' }, 'دارم می_خندم!', { e: 'laugh', m: 'grin', a: 'down', f: ['laughtears'] }]
  ],
  [ // 03 آفرود
    ['f', 'یواش_تر!', { e: 'shocked', b: 'up', m: 'o', a: 'up', f: ['sweat'] }, 'گاز وِرمه خانوم!', { e: 'cool', m: 'grin', a: 'wheel', p: 'wheel' }],
    ['m', 'دوبل زدی؟', { e: 'normal', b: 'raised', m: 'o', a: 'point' }, 'از قبل زدم!', { e: 'cool', m: 'smirk', a: 'wheel', p: 'wheel' }],
    ['f', 'کی رانندگی کنه؟', { e: 'normal', b: 'raised', m: 'smirk', a: 'chin' }, 'معلومه، من!', { e: 'cool', m: 'grin', a: 'thumb' }],
    ['m', 'نقشه دستته؟', { e: 'normal', b: 'up', m: 'smile', a: 'point' }, 'نقشه کجا بود؟!', { e: 'shocked', m: 'grit', a: 'shrug', f: ['sweat'] }],
    ['f', 'بنزین داریم؟', { e: 'normal', b: 'sad', m: 'o', a: 'chin' }, 'تا قله آره!', { e: 'happy', m: 'grin', a: 'thumb' }],
    ['m', 'آهنگ چی بذارم؟', { e: 'normal', b: 'raised', m: 'smile', a: 'hold', p: 'phone' }, 'یه شاد بذار!', { e: 'happy', m: 'grin', a: 'up', f: ['music'] }]
  ],
  [ // 04 گیر و سوتی
    ['m', 'گیر کردیم!', { e: 'shocked', m: 'grit', a: 'shrug', f: ['sweat', 'mud'] }, 'گفتم از اون ور برو!', { e: 'normal', b: 'angry', m: 'o', a: 'point', f: ['anger'] }],
    ['f', 'وینچ داری؟', { e: 'normal', b: 'raised', m: 'o', a: 'chin' }, 'داشتیم دیگه…', { e: 'happy', b: 'sad', m: 'grit', a: 'shrug', f: ['sweat'] }],
    ['m', 'هل بده!', { e: 'normal', b: 'angry', m: 'grit', a: 'point', f: ['mud'] }, 'تو هل بده!', { e: 'normal', b: 'angry', m: 'grit', a: 'point' }],
    ['f', 'سوتی دادی؟', { e: 'wink', m: 'smirk', a: 'point' }, 'نه… یعنی آره', { e: 'happy', b: 'sad', m: 'grit', a: 'shrug', f: ['sweat'] }],
    ['m', 'کسی ندید؟', { e: 'shocked', m: 'grit', a: 'shrug', f: ['sweat'] }, 'همه دیدن!', { e: 'laugh', m: 'grin', a: 'point', f: ['laughtears'] }],
    ['f', 'عکس بگیرم؟', { e: 'wink', m: 'grin', a: 'hold2', p: 'camera' }, 'نه تو رو خدا!', { e: 'cry', b: 'sad', m: 'o', a: 'up', f: ['mud'] }]
  ],
  [ // 05 کمپ و شب
    ['m', 'آتیش روشن شد!', { e: 'happy', m: 'grin', a: 'raise', p: 'torch' }, 'بالاخره!', { e: 'sleepy', m: 'smirk', a: 'shrug' }],
    ['f', 'صدای چی بود؟', { e: 'shocked', b: 'up', m: 'o', a: 'up', f: ['sweat'] }, 'باد بود… فکر کنم', { e: 'shocked', m: 'grit', a: 'shrug', f: ['sweat'] }],
    ['m', 'چای می_خوری؟', { e: 'happy', m: 'smile', a: 'hold', p: 'tea' }, 'دوتا!', { e: 'love', m: 'grin', a: 'up' }],
    ['f', 'ستاره_ها رو ببین', { e: 'love', m: 'smile', a: 'raise', f: ['stars'] }, 'تو قشنگ_تری', { e: 'love', m: 'smile', a: 'down', f: ['hearts'] }],
    ['m', 'سردته؟', { e: 'normal', b: 'sad', m: 'smile', a: 'chin' }, 'یخ زدم!', { e: 'cry', b: 'sad', m: 'grit', a: 'down', f: ['cold'] }],
    ['f', 'کی خروپف می_کنه؟', { e: 'normal', b: 'angry', m: 'grit', a: 'point', f: ['anger'] }, 'من نبودم!', { e: 'sleepy', m: 'grit', a: 'shrug' }]
  ],
  [ // 06 خوراکی
    ['f', 'صبحونه آماده_ست!', { e: 'happy', m: 'grin', a: 'hold', p: 'plate' }, 'اومدم اومدم!', { e: 'shocked', m: 'grin', a: 'up' }],
    ['m', 'ته_دیگ مال کیه؟', { e: 'normal', b: 'raised', m: 'smirk', a: 'hold', p: 'plate' }, 'معلومه، من!', { e: 'wink', m: 'grin', a: 'point' }],
    ['f', 'خوشمزه شد؟', { e: 'normal', b: 'up', m: 'smile', a: 'chin' }, 'محشره!', { e: 'love', m: 'tongue', a: 'thumb', f: ['hearts'] }],
    ['m', 'رژیم نبودی؟', { e: 'wink', m: 'smirk', a: 'point' }, 'از فردا!', { e: 'happy', m: 'tongue', a: 'hold', p: 'plate' }],
    ['f', 'ظرفا با کی؟', { e: 'normal', b: 'raised', m: 'smirk', a: 'chin' }, 'با… تو؟', { e: 'happy', b: 'sad', m: 'grit', a: 'point', f: ['sweat'] }],
    ['m', 'یه چای بریز', { e: 'wink', m: 'smile', a: 'hold', p: 'mug' }, 'خودت بریز!', { e: 'normal', b: 'angry', m: 'smirk', a: 'shrug' }]
  ],
  [ // 07 رفاقت
    ['m', 'پایه_ای؟', { e: 'wink', m: 'smirk', a: 'point' }, 'همیشه!', { e: 'happy', m: 'grin', a: 'up' }],
    ['f', 'بدون من نری_ها!', { e: 'normal', b: 'angry', m: 'smirk', a: 'point' }, 'عمراً!', { e: 'love', m: 'grin', a: 'thumb' }],
    ['m', 'تیم ما خفنه', { e: 'cool', m: 'grin', a: 'up' }, 'معلومه!', { e: 'cool', m: 'smirk', a: 'thumb' }],
    ['f', 'آشتی؟', { e: 'normal', b: 'sad', m: 'smile', a: 'chin' }, 'آشتی!', { e: 'love', m: 'grin', a: 'up', f: ['hearts'] }],
    ['m', 'عکس بگیریم؟', { e: 'happy', m: 'grin', a: 'hold2', p: 'camera' }, 'بگیر دیگه!', { e: 'wink', m: 'tongue', a: 'thumb' }],
    ['f', 'مرسی که هستی', { e: 'love', m: 'smile', a: 'down', f: ['hearts'] }, 'تو هم!', { e: 'love', m: 'grin', a: 'point' }]
  ],
  [ // 08 تعارف
    ['m', 'بفرمایید', { e: 'happy', m: 'smile', a: 'point' }, 'اول شما!', { e: 'shy', m: 'smile', a: 'point' }],
    ['f', 'قابل نداره', { e: 'wink', m: 'smile', a: 'hold', p: 'plate' }, 'صاحبش قابل داره!', { e: 'happy', m: 'grin', a: 'thumb' }],
    ['m', 'زحمت کشیدی', { e: 'love', m: 'smile', a: 'down' }, 'چه زحمتی؟', { e: 'shy', m: 'smile', a: 'chin' }],
    ['f', 'بخور دیگه!', { e: 'normal', b: 'up', m: 'grin', a: 'hold', p: 'plate' }, 'سیرم به خدا!', { e: 'sleepy', m: 'grit', a: 'shrug' }],
    ['m', 'دستت درد نکنه', { e: 'happy', m: 'grin', a: 'thumb' }, 'نوش جونت!', { e: 'love', m: 'smile', a: 'down', f: ['hearts'] }],
    ['f', 'شرمنده_مون کردی', { e: 'shy', m: 'smile', a: 'down' }, 'دشمنت شرمنده!', { e: 'happy', m: 'grin', a: 'wave' }]
  ],
  [ // 09 قرار
    ['f', 'کجایی؟', { e: 'normal', b: 'angry', m: 'o', a: 'hold', p: 'phone', f: ['anger'] }, 'میام، زنگ نزن!', { e: 'normal', b: 'angry', m: 'grit', a: 'hold', p: 'phone' }],
    ['m', 'حاضری؟', { e: 'normal', b: 'raised', m: 'o', a: 'chin' }, 'پنج دقیقه!', { e: 'wink', m: 'smirk', a: 'point' }],
    ['f', 'دیر کردی!', { e: 'normal', b: 'angry', m: 'grit', a: 'point', f: ['anger'] }, 'ترافیک بود!', { e: 'happy', b: 'sad', m: 'grit', a: 'shrug', f: ['sweat'] }],
    ['m', 'لوکیشن بفرست', { e: 'normal', b: 'up', m: 'smile', a: 'hold', p: 'phone' }, 'فرستادم!', { e: 'happy', m: 'grin', a: 'hold', p: 'phone' }],
    ['f', 'هنوز خوابی؟!', { e: 'shocked', b: 'up', m: 'o', a: 'point' }, 'نه… بیدارم!', { e: 'sleepy', m: 'sleep', a: 'down', f: ['zzz'] }],
    ['m', 'کی می_رسی؟', { e: 'normal', b: 'raised', m: 'o', a: 'hold', p: 'phone' }, 'رسیدم!', { e: 'happy', m: 'grin', a: 'up', f: ['stars'] }]
  ],
  [ // 10 خستگی
    ['m', 'خسته نباشی', { e: 'happy', m: 'smile', a: 'thumb' }, 'تو هم!', { e: 'sleepy', m: 'smile', a: 'down' }],
    ['f', 'کی جمعه می_شه؟', { e: 'cry', b: 'sad', m: 'o', a: 'chin' }, 'هیچ_وقت!', { e: 'sleepy', b: 'sad', m: 'sad', a: 'shrug' }],
    ['m', 'حوصله داری؟', { e: 'normal', b: 'raised', m: 'smile', a: 'chin' }, 'اصلاً!', { e: 'sleepy', m: 'sad', a: 'shrug' }],
    ['f', 'بریم کوه؟', { e: 'happy', m: 'grin', a: 'point' }, 'بزن بریم!', { e: 'happy', m: 'grin', a: 'up', f: ['stars'] }],
    ['m', 'گرمه؟', { e: 'dizzy', m: 'tongue', a: 'down', f: ['sweat'] }, 'پختم!', { e: 'dizzy', m: 'tongue', a: 'down', f: ['steam'] }],
    ['f', 'کار داری؟', { e: 'normal', b: 'raised', m: 'smile', a: 'chin' }, 'ولش کن، بریم!', { e: 'cool', m: 'grin', a: 'wave' }]
  ],
  [ // 11 مناسبت
    ['m', 'تولدت مبارک!', { e: 'happy', m: 'grin', a: 'up', f: ['stars'] }, 'کادوم کو؟', { e: 'wink', m: 'smirk', a: 'chin' }],
    ['f', 'عید مبارک!', { e: 'happy', m: 'grin', a: 'wave' }, 'عیدی بده!', { e: 'wink', m: 'tongue', a: 'point' }],
    ['m', 'یلدا کجاییم؟', { e: 'normal', b: 'raised', m: 'smile', a: 'chin' }, 'دور آتیش!', { e: 'happy', m: 'grin', a: 'raise', p: 'torch' }],
    ['f', 'سیزده_بدر؟', { e: 'normal', b: 'raised', m: 'smile', a: 'chin' }, 'کمپ وایکینگ!', { e: 'cool', m: 'grin', a: 'thumb' }],
    ['m', 'مبارکه!', { e: 'happy', m: 'grin', a: 'up' }, 'شیرینیش با تو!', { e: 'wink', m: 'grin', a: 'point' }],
    ['f', 'سال نو مبارک', { e: 'love', m: 'smile', a: 'wave', f: ['hearts'] }, 'صد سال به این سالا!', { e: 'happy', m: 'grin', a: 'up', f: ['stars'] }]
  ],
  [ // 12 رزرو
    ['f', 'جا داره؟', { e: 'normal', b: 'up', m: 'o', a: 'chin' }, 'دو تا مونده!', { e: 'shocked', m: 'grin', a: 'point', f: ['exclaim'] }],
    ['m', 'رزرو کردی؟', { e: 'normal', b: 'raised', m: 'smirk', a: 'point' }, 'معلومه که آره!', { e: 'cool', m: 'grin', a: 'thumb' }],
    ['f', 'قیمتش؟', { e: 'normal', b: 'raised', m: 'o', a: 'chin' }, 'دایرکت!', { e: 'wink', m: 'grin', a: 'hold', p: 'phone' }],
    ['m', 'کی می_ریم؟', { e: 'happy', m: 'smile', a: 'chin' }, 'همین آخر هفته!', { e: 'happy', m: 'grin', a: 'raise', p: 'flag' }],
    ['f', 'رفیقمم بیارم؟', { e: 'normal', b: 'up', m: 'smile', a: 'point' }, 'هرچی بیشتر، بهتر!', { e: 'happy', m: 'grin', a: 'thumb' }],
    ['m', 'پر شد!', { e: 'laugh', m: 'grin', a: 'point' }, 'دیر جنبیدم؟!', { e: 'cry', b: 'sad', m: 'o', a: 'shrug' }]
  ]
];
