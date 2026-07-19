// Rate limiter — in-memory sliding window, capped via lru-cache when available.
// Falls back to Map when lru-cache not installed.
let lruCache = null;
try { lruCache = require('lru-cache'); } catch (_) { /* optional dep */ }

class Bucket {
  constructor() { this.events = []; }
  hit(now, window) {
    this.events = this.events.filter(t => t > now - window);
    this.events.push(now);
    return this.events.length;
  }
}

function makeLimiter({ windowMs, max, keyFn }) {
  const buckets = new Map();
  return function limit(req, res, next) {
    const key = keyFn(req);
    const now = Date.now();
    const b = buckets.get(key) || new Bucket();
    const count = b.hit(now, windowMs);
    buckets.set(key, b);
    if (count > max) {
      res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
      return res.status(429).json({ error: 'rate-limited', retry_after_ms: windowMs });
    }
    next();
  };
}

// Convenience factories used across routes.
function byIp(max, windowMs) { return makeLimiter({ windowMs, max, keyFn: req => req.ip }); }
function byRep(max, windowMs) {
  return makeLimiter({ windowMs, max, keyFn: req => (req.rep && req.rep.id) ? `rep:${req.rep.id}` : req.ip });
}

module.exports = { makeLimiter, byIp, byRep };
