import { rateLimit, requireAuth } from '../auth.js';
import { fetchFeed } from '../podcast.js';
import { HttpError, str } from '../util.js';

export const routes = [
  ['GET', '/api/podcast/feed', async (c) => {
    const a = requireAuth(c);
    if (!(await rateLimit(c.env, `pod:${a.user.id}`, 90, 3600))) throw new HttpError(429, 'rate_limited', 'Too many podcast lookups this hour.');
    try {
      return await fetchFeed(str(c.url.searchParams.get('url') || '', 600));
    } catch (e) {
      throw new HttpError(e.status || 502, e.code || 'feed_failed', e.message);
    }
  }],
];
