// Load unread notification count for the current rep into res.locals.
const notifications = require('../db/notifications');

function loadNotifications() {
  return (req, res, next) => {
    res.locals.unreadCount = 0;
    if (!req.rep || !req.rep.id) return next();
    notifications.countUnread(req.rep.id)
      .then(n => { res.locals.unreadCount = n; next(); })
      .catch(() => next());
  };
}

module.exports = loadNotifications;
