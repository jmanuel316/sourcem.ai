const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const reps = require('../db/reps');
const accountScores = require('../db/account-scores');
const signals = require('../db/signals');
const pipelineRuns = require('../db/pipeline-runs');
const pipelineAlerts = require('../services/pipeline-alert-notifier');

// All routes require admin role
router.use(requireAdmin);

router.get('/overview', async (_req, res) => {
  try {
    const data = await accountScores.getTodayOverview();
    res.json(data);
  } catch (err) {
    console.error('[admin] overview error:', err);
    res.status(500).json({ error: 'failed to load overview' });
  }
});

router.get('/team-stats', async (_req, res) => {
  try {
    const data = await reps.getActiveRepsWithStats();
    res.json({ reps: data });
  } catch (err) {
    console.error('[admin] team-stats error:', err);
    res.status(500).json({ error: 'failed to load team stats' });
  }
});

router.get('/top-accounts', async (_req, res) => {
  try {
    const data = await accountScores.getTopAccountsToday(10);
    res.json({ accounts: data });
  } catch (err) {
    console.error('[admin] top-accounts error:', err);
    res.status(500).json({ error: 'failed to load top accounts' });
  }
});

router.get('/signal-breakdown', async (_req, res) => {
  try {
    const data = await signals.getSignalBreakdown({ days: 7 });
    res.json({ signals: data });
  } catch (err) {
    console.error('[admin] signal-breakdown error:', err);
    res.status(500).json({ error: 'failed to load signal breakdown' });
  }
});

router.get('/pipeline-health', async (_req, res) => {
  try {
    const data = await pipelineRuns.getPipelineHealth();
    pipelineAlerts.notifyAdminIfAnyPipelineRed({ rows: data })
      .catch(err => console.error('[admin] pipeline alert notify failed:', err.message));
    res.json({ pipelines: data });
  } catch (err) {
    console.error('[admin] pipeline-health error:', err);
    res.status(500).json({ error: 'failed to load pipeline health' });
  }
});

module.exports = router;