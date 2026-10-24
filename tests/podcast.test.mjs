import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decode, parseDuration, parseFeed, safeFeedUrl, fetchFeed } from '../src/podcast.js';

const RSS = `<?xml version="1.0"?><rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" version="2.0"><channel>
<title>Morning &amp; Evening Show</title><language>en-US</language><link>http://example.com/show</link>
<itunes:author>Radio Example</itunes:author><itunes:image href="http://img.example.com/show.jpg"/>
<description><![CDATA[<p>Daily news &amp; talk</p>]]></description>
<item><title><![CDATA[Episode 2: "Hello" &#38; welcome]]></title><pubDate>Mon, 20 Oct 2026 06:00:00 GMT</pubDate>
<enclosure url="http://cdn.example.com/ep2.mp3?x=1&amp;y=2" length="123" type="audio/mpeg"/><itunes:duration>01:02:03</itunes:duration><guid>ep-2</guid></item>
<item><title>Episode 1</title><pubDate>Sun, 19 Oct 2026 06:00:00 GMT</pubDate>
<enclosure url="https://cdn.example.com/ep1.m4a" type="audio/x-m4a"/><itunes:duration>905</itunes:duration><itunes:image href="https://img.example.com/ep1.jpg"/></item>
<item><title>No audio here</title><enclosure url="https://cdn.example.com/doc.pdf" type="application/pdf"/></item>
</channel></rss>`;

test('entities, CDATA and durations', () => {
  assert.equal(decode('<![CDATA[a &amp; b]]>'), 'a & b');
  assert.equal(decode('Tom &amp;amp; &#8217;s &lt;b&gt;bold&lt;/b&gt;'), 'Tom &amp; ’s bold', 'decoded once, then any HTML is removed');
  assert.equal(parseDuration('01:02:03'), 3723);
  assert.equal(parseDuration('15:05'), 905);
  assert.equal(parseDuration('905'), 905);
  assert.equal(parseDuration('soon'), 0);
});

test('a feed becomes a show and playable episode tracks', async () => {
  const { show, episodes } = await parseFeed(RSS, 'https://example.com/feed');
  assert.equal(show.title, 'Morning & Evening Show');
  assert.equal(show.author, 'Radio Example');
  assert.equal(show.image, 'https://img.example.com/show.jpg', 'http images are upgraded to https');
  assert.equal(show.language, 'en');
  assert.equal(episodes.length, 2, 'items without audio are skipped');
  const [e2, e1] = episodes;
  assert.equal(e2.title, 'Episode 2: "Hello" & welcome');
  assert.equal(e2.url, 'https://cdn.example.com/ep2.mp3?x=1&y=2');
  assert.equal(e2.duration, 3723);
  assert.equal(e2.releasedAt, Date.parse('Mon, 20 Oct 2026 06:00:00 GMT'));
  assert.equal(e2.artwork, 'https://img.example.com/show.jpg', 'falls back to the show artwork');
  assert.equal(e1.artwork, 'https://img.example.com/ep1.jpg');
  assert.match(e2.id, /^pod:[0-9a-f]{20}$/);
  assert.notEqual(e1.id, e2.id);
  assert.ok(episodes.every((e) => e.source === 'pod' && e.meta.podcast && !e.preview));
  assert.equal((await parseFeed(RSS, 'x')).episodes[0].id, e2.id, 'ids are stable between reads');
});

test('only public https feed addresses are accepted', () => {
  assert.equal(safeFeedUrl('https://feeds.example.com/show.xml'), 'https://feeds.example.com/show.xml');
  assert.equal(safeFeedUrl('http://feeds.example.com/show.xml'), 'https://feeds.example.com/show.xml', 'http is upgraded');
  for (const bad of ['file:///etc/passwd', 'https://localhost/x', 'https://127.0.0.1/x', 'https://10.0.0.5/x', 'https://[::1]/x', 'https://intranet/x', 'https://user:pw@example.com/x', 'ftp://example.com/x', 'not a url']) {
    assert.equal(safeFeedUrl(bad), null, bad);
  }
});

test('fetchFeed stops reading huge feeds and reports friendly errors', async () => {
  const big = RSS.replace('</channel>', `${'<item><title>x</title><enclosure url="https://a.example/x.mp3" type="audio/mpeg"/></item>'.repeat(20000)}</channel>`);
  let sent = 0;
  const stream = new ReadableStream({ pull(c) { const chunk = new TextEncoder().encode(big.slice(sent, sent + 60000)); if (!chunk.length) return c.close(); sent += 60000; c.enqueue(chunk); } });
  const out = await fetchFeed('https://example.com/feed', async () => new Response(stream, { status: 200 }));
  assert.ok(sent < 600000, `read only the start of the feed (${sent} bytes)`);
  assert.ok(out.episodes.length >= 2 && out.episodes.length <= 60);
  await assert.rejects(fetchFeed('https://example.com/feed', async () => new Response('no', { status: 404 })), /404/);
  await assert.rejects(fetchFeed('https://127.0.0.1/feed'), /valid podcast/);
});
