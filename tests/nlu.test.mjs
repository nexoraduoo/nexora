import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, parseNumber, clean } from '../public/js/nlu.js';

const ctx = {
  playlists: [{ id: 'p1', name: 'Gym' }],
  devices: [
    { id: 'd1', name: 'Chrome on Windows', kind: 'desktop', current: true },
    { id: 'd2', name: 'Pixel 8', kind: 'phone' },
    { id: 'd3', name: 'Living Room TV', kind: 'tv' },
  ],
};

// [phrase, expected subset of the intent]
const cases = [
  // transport
  ['pause', { type: 'pause' }],
  ['Hey Nexora, pause the music', { type: 'pause' }],
  ['hey next ora stop', { type: 'pause' }],
  ['could you please pause', { type: 'pause' }],
  ['stop the music', { type: 'pause' }],
  ['resume', { type: 'resume' }],
  ['play', { type: 'resume' }],
  ['continue playing', { type: 'resume' }],
  ['next song', { type: 'next' }],
  ['skip', { type: 'next' }],
  ['skip this song', { type: 'next' }],
  ['I don\'t like this song', { type: 'next' }],
  ['play something else', { type: 'next' }],
  ['previous track', { type: 'prev' }],
  ['go back', { type: 'seek', by: -15 }],
  ['play the last song', { type: 'prev' }],
  ['start over', { type: 'seek', to: 0 }],
  ['play it again', { type: 'seek', to: 0 }],
  // volume
  ['turn it up', { type: 'volume', delta: 15 }],
  ['volume up', { type: 'volume', delta: 15 }],
  ['a bit louder', { type: 'volume', delta: 8 }],
  ['make it quieter', { type: 'volume', delta: -15 }],
  ['too loud', { type: 'volume', delta: -15 }],
  ['set the volume to 40', { type: 'volume', set: 40 }],
  ['volume to fifty percent', { type: 'volume', set: 50 }],
  ['volume 70', { type: 'volume', set: 70 }],
  ['maximum volume', { type: 'volume', set: 100 }],
  ['mute', { type: 'mute' }],
  ['unmute', { type: 'unmute' }],
  // seek
  ['skip forward 30 seconds', { type: 'seek', by: 30 }],
  ['go forward thirty seconds', { type: 'seek', by: 30 }],
  ['rewind 10 seconds', { type: 'seek', by: -10 }],
  ['jump to 1:30', { type: 'seek', to: 90 }],
  ['go to two minutes thirty seconds', { type: 'seek', to: 150 }],
  // modes
  ['shuffle on', { type: 'shuffle', on: true }],
  ['turn off shuffle', { type: 'shuffle', on: false }],
  ['repeat this song', { type: 'repeat', mode: 'one' }],
  ['put this on repeat', { type: 'repeat', mode: 'one' }],
  ['repeat all', { type: 'repeat', mode: 'all' }],
  ['stop repeating', { type: 'repeat', mode: 'off' }],
  ['speed 1.5x', { type: 'speed', rate: 1.5 }],
  // library
  ['like this song', { type: 'like' }],
  ['I love this song', { type: 'like' }],
  ['add this to my liked songs', { type: 'like' }],
  ['unlike this', { type: 'unlike' }],
  ['add this to my gym playlist', { type: 'save_playlist', name: 'gym' }],
  ['add this song to road trip', { type: 'save_playlist', name: 'road trip' }],
  ['download this song', { type: 'download' }],
  ['what song is this', { type: 'whats_playing' }],
  ["who's singing this", { type: 'whats_playing' }],
  // timers
  ['sleep timer 30 minutes', { type: 'sleep', minutes: 30 }],
  ['stop the music in an hour', { type: 'sleep', minutes: 60 }],
  ['set a timer for fifteen minutes', { type: 'sleep', minutes: 15 }],
  ['stop after this song', { type: 'sleep', end: true }],
  ['cancel the timer', { type: 'sleep', cancel: true }],
  // navigation
  ['open my library', { type: 'open', view: 'library' }],
  ['go to settings', { type: 'open', view: 'settings' }],
  ['show lyrics', { type: 'open', view: 'lyrics' }],
  ['show me the queue', { type: 'open', view: 'queue' }],
  ['search for coldplay', { type: 'search', query: 'coldplay' }],
  // devices
  ['play on my phone', { type: 'device', id: 'd2' }],
  ['transfer to the living room tv', { type: 'device', id: 'd3' }],
  ['move the music to the tv', { type: 'device', id: 'd3' }],
  ['play here', { type: 'device', here: true }],
  ['bring it back here', { type: 'device', here: true }],
  ['play on my tablet', { type: 'device', missing: 'tablet' }],
  // queue
  ['add blinding lights to the queue', { type: 'queue', query: 'blinding lights', next: false }],
  ['play shape of you next', { type: 'queue', query: 'shape of you', next: true }],
  // play: songs
  ['play blinding lights', { type: 'play', what: 'song', query: 'blinding lights' }],
  ['play blinding lights by the weeknd', { type: 'play', what: 'song', title: 'blinding lights', artist: 'the weeknd' }],
  ['can you play shape of you by ed sheeran please', { type: 'play', what: 'song', title: 'shape of you', artist: 'ed sheeran' }],
  ['play naatu naatu from rrr', { type: 'play', what: 'song', title: 'naatu naatu', album: 'rrr' }],
  ['I want to listen to tum hi ho', { type: 'play', what: 'song', query: 'tum hi ho' }],
  ['blinding lights', { type: 'play', what: 'song', query: 'blinding lights', guess: true }],
  // play: collections
  ['play my liked songs', { type: 'play', what: 'liked' }],
  ['shuffle my liked songs', { type: 'play', what: 'liked', shuffle: true }],
  ['play my downloads', { type: 'play', what: 'downloads' }],
  ['play my gym playlist', { type: 'play', what: 'playlist', name: 'gym' }],
  ['play playlist chill vibes', { type: 'play', what: 'playlist', name: 'chill vibes' }],
  ['play arijit singh songs', { type: 'play', what: 'artist', query: 'arijit singh' }],
  ['play something by taylor swift', { type: 'play', what: 'artist', query: 'taylor swift' }],
  ['play the best of ar rahman', { type: 'play', what: 'artist', query: 'ar rahman' }],
  ['play the album divide by ed sheeran', { type: 'play', what: 'album', query: 'divide ed sheeran' }],
  ['play more like this', { type: 'play', what: 'similar' }],
  ['play something similar', { type: 'play', what: 'similar' }],
  ['play the top hits', { type: 'play', what: 'charts' }],
  ['play the latest songs', { type: 'play', what: 'new' }],
  // language / mood / radio
  ['play some telugu songs', { type: 'play', what: 'language', lang: 'te' }],
  ['play hindi music', { type: 'play', what: 'language', lang: 'hi' }],
  ['play korean songs', { type: 'play', what: 'language', lang: 'ko' }],
  ['play tamil songs for me', { type: 'play', what: 'language', lang: 'ta' }],
  ['play something relaxing', { type: 'play', what: 'mood', mood: 'chill' }],
  ['play some workout music', { type: 'play', what: 'mood', mood: 'workout' }],
  ['play something romantic', { type: 'play', what: 'mood', mood: 'romance' }],
  ['play study music', { type: 'play', what: 'mood', mood: 'focus' }],
  ['play radio', { type: 'play', what: 'radio' }],
  ['play telugu radio', { type: 'play', what: 'radio', lang: 'te' }],
  ['play radio mirchi', { type: 'play', what: 'radio', query: 'mirchi' }],
  // other languages
  ['अगला गाना', { type: 'next' }],
  ['రుకో', { type: 'play' }], // not a known word: falls back to play (documented)
  ['ఆపు', { type: 'pause' }],
  ['తరువాత పాట', { type: 'next' }],
  ['తెలుగు పాటలు ప్లే చేయి', { type: 'play', what: 'language', lang: 'te' }],
  ['अरिजीत सिंह के गाने बजाओ', { type: 'play', what: 'artist' }],
  ['siguiente', { type: 'next' }],
  ['pon música tranquila', { type: 'play' }],
  ['suivant', { type: 'next' }],
  ['nächstes lied', { type: 'next' }],
  ['lauter', { type: 'volume', delta: 15 }],
  ['play the full song', { type: 'full_song' }],
  ['play the mahabharata podcast', { type: 'play', what: 'podcast', query: 'mahabharata' }],
  ['play podcast daily brief', { type: 'play', what: 'podcast', query: 'daily brief' }],
  ['play some podcasts', { type: 'play', what: 'podcast', query: '' }],
  ['open podcasts', { type: 'open', view: 'podcasts' }],
  ['play old songs', { type: 'play', what: 'old' }],
  ['play some classics', { type: 'play', what: 'old' }],
  ['play the best songs of all time', { type: 'play', what: 'best' }],
  ['shuffle the best songs', { type: 'play', what: 'best', shuffle: true }],
  ['play it on youtube', { type: 'full_song' }],
  ['full version on youtube', { type: 'full_song' }],
  ['', { type: 'empty' }],
  ['hello', { type: 'help' }],
];

for (const [phrase, want] of cases) {
  test(`"${phrase}"`, () => {
    const got = parse(phrase, ctx);
    for (const [k, v] of Object.entries(want)) {
      assert.deepEqual(got[k], v, `${k}: expected ${JSON.stringify(v)} got ${JSON.stringify(got[k])} (intent ${JSON.stringify(got)})`);
    }
  });
}

test('number words', () => {
  assert.equal(parseNumber('thirty'), 30);
  assert.equal(parseNumber('twenty five'), 25);
  assert.equal(parseNumber('a hundred'), 100);
  assert.equal(parseNumber('half'), 0.5);
  assert.equal(parseNumber('7'), 7);
  assert.ok(Number.isNaN(parseNumber('banana')));
});

test('wake word variants are stripped', () => {
  for (const w of ['hey nexora', 'ok nexora', 'nexora', 'hey next ora', 'okay nexera']) {
    assert.equal(clean(`${w}, play queen`), 'play queen');
  }
});
