// Notifications routes — in-app bell + center + prefs.
const express = require('express');
const router = express.Router();
const { requireRep } = require('../middleware/auth');
const notificationsDb = require('../db/notifications');
const prefsDb = require('../db/notification-prefs');
const audit = require('../services/audit');

router.get('/notifications', requireRep, async (req, res) => {
  const items = await notificationsDb.listForRep(req.rep.id);
  res.render('notifications', {
    title: 'Notifications', layout: false, nav: { current: 'notifications' }, items
  });
});

router.post('/notifications/mark-read/:id', requireRep, async (req, res) => {
  await notificationsDb.markRead(parseInt(req.params.id, 10), req.rep.id);
  res.json({ ok: true });
});

router.post('/notifications/mark-all-read', requireRep, async (req, res) => {
  await notificationsDb.markAllRead(req.rep.id);
  res.json({ ok: true });
});

router.get('/settings/notifications', requireRep, async (req, res) => {
  const prefs = await prefsDb.getForRep(req.rep.id);
  res.render('settings-notifications', { title: 'Notification Preferences', layout: false, nav: { current: 'settings' }, prefs });
});

router.post('/settings/notifications', requireRep, async (req, res) => {
  const { digest_time, signal_threshold, channels } = req.body || {};
  const channelsArr = Array.isArray(channels) ? channels : (typeof channels === 'string' ? [channels] : []);
  await prefsDb.update(req.rep.id, {
    digest_time: digest_time || null,
    signal_threshold: parseInt(signal_threshold, 10) || 5,
    channels: channelsArr
  });
  await audit.record({ req, rep: req.rep }, 'notifications.prefs.updated', { metadata: { channels: channelsArr } });
  res.redirect('/settings/notifications?saved=1');
});

module.exports = router;
