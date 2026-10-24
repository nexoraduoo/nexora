// Nexora voice/text command understanding. Pure functions: transcript in, intent out.
// Handles polite phrasing ("could you please..."), a mis-heard wake word, spoken numbers, moods,
// languages, device names, and command words in several languages (Hindi, Telugu, Tamil, Spanish,
// French, German, Portuguese). Anything it doesn't recognise as a command becomes "play <that>".
import { LANGUAGES } from './shared/sources.js';

// ------------------------------------------------------------------ vocabulary
const NUM_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30,
  forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, a: 1, an: 1, half: 0.5,
};

export function parseNumber(s) {
  s = String(s || '').trim().toLowerCase();
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  if (/^half( an?)?$/.test(s)) return 0.5;
  const parts = s.replace(/-/g, ' ').split(/\s+/).filter((w) => w !== 'and');
  if (!parts.length) return NaN;
  let total = 0;
  for (const p of parts) {
    if (p === 'hundred') total = (total || 1) * 100;
    else if (p in NUM_WORDS) total += NUM_WORDS[p];
    else if (/^\d+$/.test(p)) total += Number(p);
    else return NaN;
  }
  return total;
}
const NUM = '(\\d+(?:\\.\\d+)?|(?:a|an|half|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)(?:[ -](?:one|two|three|four|five|six|seven|eight|nine|and|half|a|hundred))*)';

const MOODS = [
  ['chill', /\b(relax(?:ing|ed)?|chill(?:ed)?|calm(?:ing)?|peaceful|mellow|lo-?fi|soothing|easy listening)\b/],
  ['focus', /\b(focus|study(?:ing)?|concentrat\w+|working|deep work|reading)\b/],
  ['workout', /\b(work ?out|gym|exercise|running|run|energetic|energy|pump(?:ed)? up|cardio|training|fitness)\b/],
  ['party', /\b(party|dance|dancing|club|banger|celebrat\w+|dj)\b/],
  ['romance', /\b(romantic|romance|love|lovey|date night|valentine)\b/],
  ['sad', /\b(sad|heartbreak|heartbroken|crying|cry|breakup|break up|lonely|emotional|melancholy)\b/],
  ['devotional', /\b(devotional|bhakti|spiritual|prayer|gospel|hymns?|bhajans?|worship)\b/],
  ['sleep', /\b(sleep(?:y|ing)?|bedtime|lullaby|go to bed|insomnia)\b/],
  ['happy', /\b(happy|good vibes?|feel good|cheerful|uplifting|upbeat|sunny|positive)\b/],
  ['road', /\b(road ?trip|driving|drive|travel(?:ing)?|long ride)\b/],
];

const LANG_ALIASES = {
  bollywood: 'hi', hindi: 'hi', tollywood: 'te', telugu: 'te', kollywood: 'ta', tamil: 'ta', kannada: 'kn', sandalwood: 'kn',
  malayalam: 'ml', mollywood: 'ml', punjabi: 'pa', bhangra: 'pa', bengali: 'bn', bangla: 'bn', marathi: 'mr', gujarati: 'gu',
  urdu: 'ur', english: 'en', spanish: 'es', latin: 'es', portuguese: 'pt', brazilian: 'pt', french: 'fr', german: 'de', italian: 'it',
  korean: 'ko', 'k-pop': 'ko', kpop: 'ko', 'k pop': 'ko', japanese: 'ja', 'j-pop': 'ja', jpop: 'ja', anime: 'ja', chinese: 'zh',
  mandarin: 'zh', cantonese: 'zh', mandopop: 'zh', arabic: 'ar', turkish: 'tr', russian: 'ru', persian: 'fa', farsi: 'fa', thai: 'th',
  vietnamese: 'vi', indonesian: 'id', nepali: 'ne', swahili: 'sw', polish: 'pl', dutch: 'nl', greek: 'el', hebrew: 'he', swedish: 'sv', ukrainian: 'uk',
  // native names
  'తెలుగు': 'te', 'हिन्दी': 'hi', 'हिंदी': 'hi', 'தமிழ்': 'ta', 'ಕನ್ನಡ': 'kn', 'മലയാളം': 'ml', 'ਪੰਜਾਬੀ': 'pa', 'বাংলা': 'bn', 'मराठी': 'mr',
  'español': 'es', 'français': 'fr', 'deutsch': 'de', '한국어': 'ko', '日本語': 'ja', '中文': 'zh', 'العربية': 'ar',
};
for (const [code, name, native] of LANGUAGES) { LANG_ALIASES[name.toLowerCase()] = code; LANG_ALIASES[native.toLowerCase()] = code; }

const SONG_WORDS = '(?:songs?|music|tracks?|hits?|tunes?|melod(?:y|ies)|numbers|playlists?|mix|gaane|gana|gaana|गाने|गाना|संगीत|పాటలు|పాట|பாடல்கள்|பாடல்|canciones|canción|música|chansons|chanson|lieder|lied|músicas|musica|canzoni)';

// whole-utterance commands in other languages -> canonical English
const LEX = {
  pause: ['रुको', 'रुक जाओ', 'बंद करो', 'पॉज़', 'ruko', 'band karo', 'ఆపు', 'ఆపండి', 'పాజ్', 'నిలిపివేయి', 'நிறுத்து', 'நிறுத்துங்கள்', 'pausa', 'pausar', 'para', 'detén', 'arrête', 'stopp', 'halt'],
  resume: ['जारी रखो', 'फिर से चलाओ', 'चालू करो', 'jaari rakho', 'కొనసాగించు', 'தொடர்', 'continúa', 'continuar', 'reanuda', 'reprends', 'weiter spielen', 'continua'],
  next: ['अगला गाना', 'अगला', 'अगला गीत', 'agla gana', 'agla', 'తరువాత పాట', 'తర్వాత పాట', 'నెక్స్ట్', 'తరువాత', 'அடுத்த பாடல்', 'அடுத்தது', 'siguiente', 'siguiente canción', 'próxima', 'próxima canción', 'suivant', 'chanson suivante', 'nächstes lied', 'nächster titel', 'weiter', 'próxima música', 'prossima'],
  prev: ['पिछला गाना', 'पिछला', 'pichla gana', 'pichla', 'మునుపటి పాట', 'వెనుకటి పాట', 'முந்தைய பாடல்', 'anterior', 'canción anterior', 'précédent', 'chanson précédente', 'vorheriges lied', 'zurück', 'música anterior', 'precedente'],
  volUp: ['आवाज़ बढ़ाओ', 'आवाज बढ़ाओ', 'awaaz badhao', 'volume badhao', 'వాల్యూమ్ పెంచు', 'సౌండ్ పెంచు', 'ஒலியை அதிகரி', 'sube el volumen', 'más volumen', 'monte le son', 'augmente le volume', 'lauter', 'aumenta o volume'],
  volDown: ['आवाज़ कम करो', 'आवाज कम करो', 'awaaz kam karo', 'volume kam karo', 'వాల్యూమ్ తగ్గించు', 'సౌండ్ తగ్గించు', 'ஒலியை குறை', 'baja el volumen', 'menos volumen', 'baisse le son', 'diminue le volume', 'leiser', 'diminui o volume'],
};
const PLAY_VERBS = ['बजाओ', 'चलाओ', 'सुनाओ', 'लगाओ', 'bajao', 'chalao', 'sunao', 'lagao', 'ప్లే చేయి', 'ప్లే చెయ్యి', 'వేయి', 'వేయండి', 'పెట్టు', 'పెట్టండి', 'వినిపించు', 'போடு', 'போடுங்கள்', 'இயக்கு', 'ஒலிபரப்பு', 'pon', 'reproduce', 'toca', 'poner', 'ponme', 'joue', 'mets', 'lance', 'spiel', 'spiele', 'abspielen', 'toque', 'tocar', 'riproduci', 'suona'];

// ------------------------------------------------------------------ helpers
export function clean(raw) {
  let s = String(raw || '').normalize('NFKC').toLowerCase().replace(/[“”"]/g, '').replace(/[’‘]/g, "'");
  // keep decimals ("1.5x"), drop other punctuation
  s = s.replace(/(?<!\d)\.|\.(?!\d)|[,!?;¿¡।]+/g, ' ').replace(/\s+/g, ' ').trim();
  // wake word, including common mis-hearings
  s = s.replace(/^(?:(?:hey|hi|hello|ok|okay|yo|hey there)[ ,]+)?(?:nexora|next ora|nex ora|nexor a|nexera|nexura|nexxora|next sora|next or a|necsora|nexora's|next aura|next era|nexora assistant|assistant)\b[ ,:]*/i, '');
  s = s.replace(/^(?:hey|ok|okay|hi|yo)\s+/, '');
  // politeness / filler
  s = s.replace(/\b(?:please|kindly|pls|for me|to me|thanks|thank you|right now|now|just|go ahead and|would you mind|if you can|if possible)\b/g, ' ');
  s = s.replace(/^(?:can|could|would|will|shall) you\s+/, '').replace(/^(?:i want to|i wanna|i would like to|i'd like to|i'd love to|i need to|i feel like|i am in the mood to|i'm in the mood to|let's|lets|let me|we want to|we should)\s+/, '');
  s = s.replace(/^(?:and|so|then|uh|um|hmm)\s+/, '');
  return s.replace(/\s+/g, ' ').trim();
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const anyOf = (list) => new RegExp(`^(?:${list.map(esc).join('|')})$`, 'i');

function findLang(s) {
  const words = Object.keys(LANG_ALIASES).sort((a, b) => b.length - a.length);
  for (const w of words) {
    const re = /^[\x00-\x7f]+$/.test(w) ? new RegExp(`(?:^|\\s)${esc(w)}(?=\\s|$)`, 'i') : new RegExp(esc(w), 'i');
    if (re.test(s)) return { code: LANG_ALIASES[w], word: w };
  }
  return null;
}
function findMood(s) {
  for (const [id, re] of MOODS) if (re.test(s)) return id;
  return null;
}

// \b does not work for Devanagari/Telugu/Tamil etc., so use Unicode-aware boundaries
const SW_RE = new RegExp(`(?<![\\p{L}\\p{N}])${SONG_WORDS}(?![\\p{L}\\p{N}])`, 'iu');
const SW_RE_G = new RegExp(SW_RE.source, 'giu');

/** Remove "songs/music" words (and Hindi possessive particles) to leave just the subject */
const stripSongWord = (s) => s.replace(SW_RE_G, ' ').replace(/\s+/g, ' ').replace(/\s+(?:के|की|का|ke|ki|ka)$/i, '').trim();

function deviceMatch(s, devices = []) {
  s = s.replace(/^(?:my|the|this)\s+/, '').replace(/\s+(?:device|please)$/, '').trim();
  if (!s) return null;
  if (/^(?:here|this (?:device|phone|laptop|computer|tablet|pc)|me)$/.test(s)) return { here: true };
  for (const d of devices) {
    const n = d.name.toLowerCase();
    if (n === s || n.includes(s) || s.includes(n)) return { id: d.id, name: d.name };
  }
  const kindWords = { phone: /\b(phone|mobile|iphone|android|pixel|galaxy)\b/, tv: /\b(tv|television|living room|big screen)\b/, tablet: /\b(tablet|ipad)\b/, desktop: /\b(laptop|computer|desktop|pc|mac|macbook|windows|work)\b/, watch: /\b(watch)\b/ };
  for (const [kind, re] of Object.entries(kindWords)) {
    if (re.test(s)) {
      const hit = devices.find((d) => d.kind === kind && !d.current);
      if (hit) return { id: hit.id, name: hit.name };
      return { missing: s };
    }
  }
  return null;
}

// ------------------------------------------------------------------ the parser
/**
 * parse(transcript, ctx) -> intent
 * ctx: { playlists: [{id,name}], devices: [{id,name,kind,current}], hasTrack: bool }
 */
export function parse(raw, ctx = {}) {
  const original = String(raw || '').trim();
  let s = clean(original);
  if (!s) return { type: 'empty' };

  // --- command words in other languages (whole utterance)
  for (const [key, list] of Object.entries(LEX)) {
    if (anyOf(list).test(s)) {
      return { pause: { type: 'pause' }, resume: { type: 'resume' }, next: { type: 'next' }, prev: { type: 'prev' }, volUp: { type: 'volume', delta: 15 }, volDown: { type: 'volume', delta: -15 } }[key];
    }
  }
  // verb-final languages: "<subject> <play verb>"
  for (const v of PLAY_VERBS) {
    if (s.endsWith(` ${v}`)) { s = `play ${s.slice(0, -v.length - 1).trim()}`; break; }
    if (s.startsWith(`${v} `)) { s = `play ${s.slice(v.length + 1).trim()}`; break; }
  }

  let m;

  // --- help / small talk
  if (/^(?:help|what can you do|what do you do|commands|how do i use you|how does this work|who are you|hello|hi|hey)$/.test(s)) return { type: 'help' };

  // --- "play the full song" (swap a 30-second preview for the YouTube version)
  if (/^(?:play )?(?:the )?full (?:song|version|track)(?: (?:on|from|in) youtube)?$|^play (?:it|this|that|the song)? ?(?:on|from|in) youtube$/.test(s)) return { type: 'full_song' };

  // --- sleep timer
  if ((m = s.match(new RegExp(`(?:sleep timer|timer|stop (?:the )?(?:music|playing|playback|song)|turn (?:it |the music )?off|pause)\\s+(?:in|after|for)\\s+${NUM}\\s*(hours?|hrs?|minutes?|mins?|seconds?)`)))) {
    const n = parseNumber(m[1]);
    const unit = m[2][0];
    const minutes = unit === 'h' ? n * 60 : unit === 's' ? Math.max(1, Math.round(n / 60)) : n;
    if (n > 0) return { type: 'sleep', minutes: Math.round(minutes) };
  }
  if ((m = s.match(new RegExp(`^(?:set (?:a |the )?)?(?:sleep )?timer (?:(?:for|to|of|in|after) )?${NUM}\\s*(hours?|hrs?|minutes?|mins?)`)))) {
    const n = parseNumber(m[1]);
    return { type: 'sleep', minutes: Math.round(m[2][0] === 'h' ? n * 60 : n) };
  }
  if (/stop (?:after|when) (?:this|the current) (?:song|track)(?: ends| finishes)?|end of (?:this )?(?:song|track)/.test(s)) return { type: 'sleep', end: true };
  if (/^(?:cancel|stop|remove|turn off|clear) (?:the |my )?(?:sleep )?timer$/.test(s)) return { type: 'sleep', cancel: true };

  // --- volume
  if ((m = s.match(new RegExp(`(?:volume|sound|audio)\\s+(?:to|at|=)?\\s*${NUM}\\s*(?:percent|%)?$`))) || (m = s.match(new RegExp(`(?:set|put|turn|change|make) (?:the )?(?:volume|sound) (?:to |at )?${NUM}\\s*(?:percent|%)?`)))) {
    const n = parseNumber(m[1]);
    if (n >= 0 && n <= 100) return { type: 'volume', set: n };
  }
  if (/(?:max(?:imum)?|full|highest|loudest) (?:volume|sound)|volume (?:to |at )?(?:max|full)|turn it all the way up|blast it/.test(s)) return { type: 'volume', set: 100 };
  if (/(?:minimum|lowest|min) volume|volume (?:to )?(?:min|lowest)/.test(s)) return { type: 'volume', set: 8 };
  if (/^(?:mute|silence|mute (?:it|the (?:music|sound|volume|audio)))$/.test(s)) return { type: 'mute' };
  if (/^(?:unmute|un-mute|sound on|turn (?:the )?sound (?:back )?on|restore (?:the )?(?:sound|volume))$/.test(s)) return { type: 'unmute' };
  if (/\b(?:turn (?:it )?up|louder|volume up|(?:increase|raise|boost|up) (?:the )?(?:volume|sound)|higher volume|crank (?:it )?up|too quiet|can'?t hear|speak up|bit louder)\b/.test(s)) {
    const by = s.match(new RegExp(`by ${NUM}`));
    return { type: 'volume', delta: by ? parseNumber(by[1]) : /\b(?:little|bit|slightly)\b/.test(s) ? 8 : 15 };
  }
  if (/\b(?:turn (?:it )?down|quieter|softer|volume down|(?:decrease|reduce|lower|drop|down) (?:the )?(?:volume|sound)|lower volume|too loud|not so loud|bit lower|bit quieter)\b/.test(s)) {
    const by = s.match(new RegExp(`by ${NUM}`));
    return { type: 'volume', delta: -(by ? parseNumber(by[1]) : /\b(?:little|bit|slightly)\b/.test(s) ? 8 : 15) };
  }

  // --- shuffle / repeat (as settings; "shuffle my X" falls through to play)
  if (/^(?:turn |switch )?(?:on )?shuffle(?: on| mode)?$|^(?:turn on|enable|start) shuffl(?:e|ing)(?: mode)?$|^shuffle (?:this|it|the queue)$/.test(s)) return { type: 'shuffle', on: true };
  if (/^(?:turn |switch )?(?:off )?shuffle off$|^(?:turn off|disable|stop|no) shuffl(?:e|ing)(?: mode)?$|^unshuffle$/.test(s)) return { type: 'shuffle', on: false };
  if (/^(?:repeat|loop) (?:this|the|current|it)?\s*(?:song|track|one|it)?$|^(?:put|set|play) (?:this|it)?\s*(?:song )?on (?:repeat|loop)$|^on repeat$|^repeat one$|^loop (?:this )?(?:song|track)$/.test(s)) return { type: 'repeat', mode: 'one' };
  if (/^(?:repeat|loop) (?:all|everything|the playlist|the queue|playlist|queue)$|^repeat all$/.test(s)) return { type: 'repeat', mode: 'all' };
  if (/^(?:repeat off|stop repeating|don'?t repeat|no repeat|turn off repeat|disable repeat|stop looping)$/.test(s)) return { type: 'repeat', mode: 'off' };

  // --- seek
  if ((m = s.match(new RegExp(`^(?:skip |go |jump |seek |move |fast )?(?:forward|ahead|fwd)(?: by)?(?: ${NUM}\\s*(seconds?|secs?|minutes?|mins?))?$`)))) {
    const n = m[1] ? parseNumber(m[1]) : 15;
    return { type: 'seek', by: /^m/.test(m[2] || 's') ? n * 60 : n };
  }
  if ((m = s.match(new RegExp(`^(?:skip|go|jump|seek|move|fast forward|fast-forward) (?:forward |ahead )?(?:by |for )?${NUM}\\s*(seconds?|secs?|minutes?|mins?)(?: forward| ahead)?$`)))) {
    const n = parseNumber(m[1]);
    return { type: 'seek', by: /^m/.test(m[2]) ? n * 60 : n };
  }
  if ((m = s.match(new RegExp(`^(?:rewind|go back|back|skip back|jump back|seek back|rewind by|go backwards?|back up)(?: by| for)?(?: ${NUM}\\s*(seconds?|secs?|minutes?|mins?))?$`)))) {
    const n = m[1] ? parseNumber(m[1]) : 15;
    return { type: 'seek', by: -(/^m/.test(m[2] || 's') ? n * 60 : n) };
  }
  if ((m = s.match(/^(?:jump |go |seek |skip )?to (?:the )?(\d{1,2}):(\d{2})$/))) return { type: 'seek', to: Number(m[1]) * 60 + Number(m[2]) };
  if ((m = s.match(new RegExp(`^(?:jump |go |seek |skip )?to ${NUM}\\s*(?:minutes?|mins?)(?: (?:and )?${NUM}\\s*(?:seconds?|secs?))?$`)))) {
    return { type: 'seek', to: parseNumber(m[1]) * 60 + (m[2] ? parseNumber(m[2]) : 0) };
  }
  if (/^(?:go |jump |skip )?to (?:the )?(?:start|beginning|top)$|^(?:start over|restart|from the (?:start|beginning|top)|play (?:it |this |the song |that )?again|replay(?: this)?(?: song)?)$/.test(s)) return { type: 'seek', to: 0 };

  // --- speed
  if ((m = s.match(/(?:(\d(?:\.\d+)?)\s*x\b|speed (?:to |at )?(\d(?:\.\d+)?))/))) {
    const r = parseFloat(m[1] || m[2]);
    if (r >= 0.5 && r <= 2) return { type: 'speed', rate: r };
  }
  if (/^(?:normal speed|regular speed|reset speed|speed 1)$/.test(s)) return { type: 'speed', rate: 1 };
  if (/^(?:speed up|play faster|faster)$/.test(s)) return { type: 'speed', delta: 0.25 };
  if (/^(?:slow down|play slower|slower)$/.test(s)) return { type: 'speed', delta: -0.25 };

  // --- transport
  if (/^(?:pause|pause (?:the )?(?:music|song|track|playback|it)|stop|stop (?:the )?(?:music|song|track|playing|playback|it)|halt|hold on|hold up|wait|quiet|be quiet|shut up|enough)$/.test(s)) return { type: 'pause' };
  if (/^(?:resume|continue|unpause|keep playing|carry on|go on|play|start|play (?:the )?(?:music|song|track|it)|start (?:the )?(?:music|playing)|resume (?:the )?(?:music|song|playback|track)|play again|continue playing|un-pause)$/.test(s)) return { type: 'resume' };
  if (/^(?:next|next (?:song|track|one)|skip|skip (?:this|the|that|it)?\s*(?:song|track|one)?|play (?:the )?next(?: song| track| one)?|forward|change (?:the )?(?:song|track)|another(?: one| song| track)?|something else|different song|i don'?t like this(?: song| track| one)?|skip it|not this one|play something else)$/.test(s)) return { type: 'next' };
  if (/^(?:previous|previous (?:song|track|one)|last (?:song|track|one)|go back(?: a song| one)?|play (?:the )?(?:previous|last) (?:song|track|one)|back|go to (?:the )?previous|play (?:that )?(?:song )?(?:from )?before)$/.test(s)) return { type: 'prev' };

  // --- like / playlist / download / info
  if (/^(?:unlike|dislike|unfavou?rite|remove (?:this|it|the song|this song) from (?:my )?(?:liked songs|likes|favou?rites)|unlove)(?: this| it| this song)?$/.test(s)) return { type: 'unlike' };
  if (/^(?:like|love|favou?rite|heart|like (?:this|it)(?: song| track)?|love (?:this|it)(?: song| track)?|i (?:really |absolutely )?(?:like|love) (?:this|it)(?: song| track| one)?|add (?:this|it|this song|the song)? ?to (?:my )?(?:liked songs|likes|favou?rites|favourites|favorites)|save (?:this|it|this song|the song)|this is (?:so )?good)$/.test(s)) return { type: 'like' };
  if ((m = s.match(/^(?:add|put|save|move) (?:this|it|this song|the song|this track|the current song|current song)?\s*(?:song )?(?:to|into|in|on) (?:my |the |a )?(.+?)(?: playlist)?$/)) && !/\b(?:queue|up next|line)\b/.test(m[1])) {
    return { type: 'save_playlist', name: m[1].trim() };
  }
  if (/^(?:download|download (?:this|it)(?: song| track)?|save (?:this|it)(?: song| track)? (?:offline|for offline)|make (?:this|it) (?:available )?offline|keep (?:this|it) offline)$/.test(s)) return { type: 'download' };
  if (/^(?:what(?:'s| is) (?:this|that|playing|the name of this|the current)(?: song| track| playing)?|what song is (?:this|that|playing)|who (?:sings|sang|is singing|is this|is the artist|made this|wrote this)(?: this)?(?: song)?|who(?:'s| is) (?:singing|playing|the singer|the artist)(?: this)?(?: song)?|which song is (?:this|that)|name of this song|tell me the song name|identify(?: this)?(?: song)?|what(?:'s| is) on|what am i listening to)$/.test(s)) return { type: 'whats_playing' };

  // --- navigation
  if ((m = s.match(/^(?:go to|open|show(?: me)?|take me to|navigate to|switch to|pull up)(?: the)?(?: my)? (home|search|library|settings|queue|lyrics|liked songs|likes|downloads?|offline|devices?|friends|browse|radio|podcasts?|charts?|playlists?|now playing|equali[sz]er|sound studio|admin|voice)$/))) {
    const v = m[1];
    const map = { 'liked songs': 'liked', likes: 'liked', download: 'downloads', downloads: 'downloads', offline: 'downloads', device: 'devices', devices: 'devices', podcast: 'podcasts', podcasts: 'podcasts', chart: 'charts', charts: 'charts', playlist: 'library', playlists: 'library', 'now playing': 'nowplaying', equalizer: 'equalizer', equaliser: 'equalizer', 'sound studio': 'equalizer' };
    return { type: 'open', view: map[v] || v };
  }
  if (/^(?:show|display|open|see|get)?\s*(?:the )?lyrics(?: please)?$|^what are the lyrics$/.test(s)) return { type: 'open', view: 'lyrics' };

  // --- devices:  "play on my phone", "transfer to the tv", "play here"
  if ((m = s.match(/^(?:play|move|transfer|switch|send|cast|continue|bring|take)(?: (?:this|it|the music|music|the song|playback|that))?(?: (?:back|over))? (?:on|to|onto|in|at) (.+)$/)) || (m = s.match(/^(?:bring|move|switch) (?:it|the music|music|playback|this) (?:back )?here$/) && [null, 'here'])) {
    const d = deviceMatch(m[1], ctx.devices || []);
    if (d) return d.missing ? { type: 'device', missing: d.missing } : { type: 'device', ...d };
  }
  if (/^(?:play )?here$|^play (?:it )?(?:here|on this device)$/.test(s)) return { type: 'device', here: true };

  // --- queue ("add X to the queue", "play X next")
  if ((m = s.match(/^(?:add|put|queue|queue up|line up)(?: up)? (.+?) (?:to|in|on|into) (?:the |my )?(?:queue|up next|line|list)$/))) return { type: 'queue', query: m[1].trim(), next: false };
  if ((m = s.match(/^(?:queue|queue up|add) (.+)$/)) && !/to (?:my )?(?:liked|favou?rites|playlist)/.test(s)) return { type: 'queue', query: m[1].trim(), next: false };
  if ((m = s.match(/^play (.+?) (?:next|after this(?: song| track| one)?|right after this|up next)$/))) return { type: 'queue', query: m[1].trim(), next: true };

  // --- search without playing
  if ((m = s.match(/^(?:search|find|look up|look for|google|browse|show me|show|look)(?: for)? (.+)$/)) && !/^(?:me )?(?:the )?(?:queue|lyrics)/.test(m[1])) return { type: 'search', query: m[1].trim() };

  // --- play family
  let rest = null;
  let shuffle = null;
  if ((m = s.match(/^(?:play|put on|put|start|listen to|i want to hear|hear|let me hear|throw on|spin|give me|bring up|stream|turn on|queue up|fire up|blast|drop|run|open|stream|can i (?:hear|listen to)|i want|i wanna hear|play me|get me|find me|shuffle|shuffle play|play shuffled)\s+(.+)$/))) {
    rest = m[1].trim();
    if (/^shuffle/.test(s)) shuffle = true;
    if (/^(?:shuffle|shuffled) /.test(rest)) { shuffle = true; rest = rest.replace(/^(?:shuffle|shuffled)\s+/, ''); }
    if (/\b(?:on )?shuffle$/.test(rest)) { shuffle = true; rest = rest.replace(/\s*(?:on )?shuffle$/, '').trim(); }
  } else {
    rest = s;
  }
  if (!rest) return { type: 'resume' };
  rest = rest.replace(/^(?:me )?(?:some|a few|a bit of|any|something|the)\s+(?=\S)/, (x) => (/something/.test(x) ? 'something ' : '')).trim();
  rest = rest.replace(/\s+(?:for me|please)$/, '').trim();

  const withShuffle = (i) => (shuffle ? { ...i, shuffle: true } : i);

  // similar
  if (/^(?:more like (?:this|it|that)|similar(?: songs?| music| tracks?| to (?:this|it|that))?|something similar|songs? like (?:this|it|that)|music like (?:this|it|that)|(?:start|play)? ?(?:a )?(?:song )?radio (?:from|based on|for) (?:this|it)(?: song)?|keep (?:it )?going|more of (?:this|the same)|same (?:vibe|type|kind))$/.test(rest)) return { type: 'play', what: 'similar' };
  // old / classic / best of all time (Nexora's catalogue)
  if (/^(?:the )?(?:old|oldies|classic|classics|vintage|retro|golden)(?: (?:songs?|music|hits|tracks?|ones))?$/.test(rest)) return withShuffle({ type: 'play', what: 'old' });
  if (/^(?:the )?(?:best|greatest|most (?:loved|popular|played))(?: (?:songs?|music|hits|tracks?))?(?: (?:of all time|ever|on nexora))?$/.test(rest)) return withShuffle({ type: 'play', what: 'best' });
  // top / new / charts
  if ((m = rest.match(/^(?:the )?(?:top|trending|popular|biggest|hottest|latest|new|newest|best|current)(?: (?:\d+|ten|twenty|fifty))? ?(?:hits?|songs?|music|tracks?|charts?|releases?)?(?: (?:in|from|of) (.+))?$/)) && (m[0] !== rest || true) && /(?:hits?|songs?|music|tracks?|charts?|releases?)/.test(rest)) {
    const lang = m[1] ? findLang(m[1]) : findLang(rest);
    return withShuffle({ type: 'play', what: /new|latest|newest|releases?/.test(rest) ? 'new' : 'charts', lang: lang?.code });
  }
  // liked songs
  if (/^(?:my )?(?:liked|favou?rite|favorite|saved|loved)(?: songs?| tracks?| music| ones)?$|^(?:my )?(?:likes|favou?rites|favorites)$|^(?:the )?songs? i (?:like|love|liked)$/.test(rest)) return withShuffle({ type: 'play', what: 'liked' });
  // downloads
  if (/^(?:my )?(?:downloads?|downloaded|offline)(?: songs?| music| tracks?)?$/.test(rest)) return withShuffle({ type: 'play', what: 'downloads' });
  // history
  if (/^(?:my )?(?:recent(?:ly played)?|history|last played|what i (?:was )?(?:playing|listening to)(?: before)?|where i left off)(?: songs?| music| tracks?)?$/.test(rest)) return withShuffle({ type: 'play', what: 'recent' });
  // explicit playlist
  if ((m = rest.match(/^(?:my |the )?(?:playlist )(.+)$/)) || (m = rest.match(/^(?:my |the )?(.+?) playlist$/))) return withShuffle({ type: 'play', what: 'playlist', name: m[1].trim() });
  // podcasts
  if (/^(?:the )?podcasts?$/.test(rest)) return { type: 'play', what: 'podcast', query: '' };
  if ((m = rest.match(/^(?:the )?podcasts? (.+)$/)) || (m = rest.match(/^(?:the )?(.+?) podcasts?(?: episodes?)?$/))) return { type: 'play', what: 'podcast', query: m[1].trim() };
  // radio
  if ((m = rest.match(/^(?:the )?(?:live )?(?:radio|station)(?: (?:station|channel))?(?: (.+))?$/)) || (m = rest.match(/^(.+?) (?:radio|fm|radio station|station)$/))) {
    const lang = findLang(m[1] || '');
    return { type: 'play', what: 'radio', query: lang ? '' : (m[1] || '').trim(), lang: lang?.code };
  }
  // album / artist explicit
  if ((m = rest.match(/^(?:the )?album (.+?)(?: by (.+))?$/))) return { type: 'play', what: 'album', query: [m[1], m[2]].filter(Boolean).join(' ') };
  if ((m = rest.match(/^(?:something|anything|songs?|music|stuff) (?:from|by|of) (.+)$/)) || (m = rest.match(/^(?:the )?(?:best|top|popular|greatest|essential) (?:of|from|by) (.+)$/)) || (m = rest.match(/^(?:all )?(?:songs?|music|tracks?|hits) (?:from|by|of) (.+)$/))) return withShuffle({ type: 'play', what: 'artist', query: m[1].trim() });
  if ((m = rest.match(/^(?:the )?(?:artist|band|singer) (.+)$/))) return withShuffle({ type: 'play', what: 'artist', query: m[1].trim() });

  // mood / language / genre style requests ("something relaxing", "Telugu songs")
  const lang = findLang(rest);
  const mood = findMood(rest);
  const generic = /^(?:something|anything|some|stuff|music|songs?|tracks?|hits?|vibes?)\b/.test(rest) || SW_RE.test(rest);
  if (lang && generic) {
    const subject = stripSongWord(rest.replace(new RegExp(esc(lang.word), 'i'), ' ').replace(/\b(?:in|language|something|some|any|old|new|latest|best)\b/g, ' ')).trim();
    return withShuffle({ type: 'play', what: 'language', lang: lang.code, query: subject, mood: findMood(rest) || undefined });
  }
  if (mood && (generic || /^(?:something|anything)/.test(rest) || rest.split(' ').length <= 3)) {
    return withShuffle({ type: 'play', what: 'mood', mood });
  }
  if (lang && rest.split(' ').length <= 3) return withShuffle({ type: 'play', what: 'language', lang: lang.code, query: '' });

  // "<song> by <artist>" / "<song> from <movie/album>"
  if ((m = rest.match(/^(.+?) (?:by|from the artist|sung by|singed by|performed by|of the artist) (.+)$/))) {
    return { type: 'play', what: 'song', title: m[1].trim(), artist: m[2].trim(), query: `${m[1].trim()} ${m[2].trim()}` };
  }
  if ((m = rest.match(/^(.+?) (?:from|in) (?:the )?(?:movie|film|album|series|show)?\s*(.+)$/)) && m[2].split(' ').length <= 5 && !findLang(m[2])) {
    return { type: 'play', what: 'song', title: m[1].trim(), album: m[2].trim(), query: `${m[1].trim()} ${m[2].trim()}` };
  }

  // "<artist> songs" -> artist mix
  if (SW_RE.test(rest)) {
    const subject = stripSongWord(rest);
    if (subject) return withShuffle({ type: 'play', what: 'artist', query: subject });
  }

  // anything else: treat as the name of a song
  return withShuffle({ type: 'play', what: 'song', query: rest, guess: !/^(?:play|put on|start|listen)/.test(s) });
}

/** Short example phrases shown in the voice panel */
export const EXAMPLES = [
  'Play Blinding Lights by The Weeknd',
  'Play some Telugu songs',
  'Play something relaxing',
  'Next song',
  'Turn the volume up',
  'Add this to my gym playlist',
  'Play my liked songs on shuffle',
  'Sleep timer 30 minutes',
  'What song is this?',
  'Play on my phone',
];
