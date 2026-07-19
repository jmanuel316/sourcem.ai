// Audit logging service — call this from every mutating endpoint.
const auditDb = require('../db/audit');

async function record(ctx, action, { target_type = null, target_id = null, metadata = null } = {}) {
  await auditDb.record({
    org_id: ctx.rep ? ctx.rep.company_id : null,
    actor_rep_id: ctx.rep ? ctx.rep.id : null,
    action,
    target_type,
    target_id,
    metadata
  });
}

module.exports = { record };
