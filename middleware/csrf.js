// CSRF middleware — issues token on GET, validates on mutating requests.
const crypto = require('crypto');

function token() {
  return crypto.randomBytes(20).toString('hex');
}

function csrf() {
  return (req, res, next) => {
    // Bypass for Stripe webhook (signature-validated) and API bearer tokens.
    if (req.path.startsWith('/api/stripe/webhook')) return next();
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) return next();

    const isMutating = ['POST','PUT','PATCH','DELETE'].includes(req.method);
    let cookie = req.cookies && req.cookies.sourcemai_csrf;
    if (!cookie) {
      cookie = token();
      res.setHeader('Set-Cookie', `sourcemai_csrf=${cookie}; Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
    }
    res.locals.csrfToken = cookie;

    if (!isMutating) return next();

    const provided = req.headers['x-csrf-token'] || (req.body && req.body._csrf);
    if (!provided || provided !== cookie) {
      return res.status(403).json({ error: 'invalid-csrf-token' });
    }
    next();
  };
}

module.exports = csrf;
