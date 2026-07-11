'use strict';

function createRateLimiter({ windowMs, max, keyFn, code = 'RATE_LIMITED' }) {
  const buckets = new Map();

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets.entries()) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, Math.min(windowMs, 60_000));
  cleanup.unref();

  return function rateLimit(req, res, next) {
    const key = String(keyFn(req) || 'anonymous');
    const now = Date.now();
    let bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    const remaining = Math.max(0, max - bucket.count);
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: {
          code,
          message: 'Has realizado demasiadas solicitudes. Intenta nuevamente más tarde.',
        },
      });
    }

    return next();
  };
}

module.exports = { createRateLimiter };
