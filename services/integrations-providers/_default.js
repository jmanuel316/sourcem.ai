// Default provider stub — used by all v1 integrations until real OAuth keys land.
// Connectivity tests pass when a non-empty config is stored; otherwise return not_configured.
module.exports = {
  async testConnection({ config }) {
    if (!config || !config.access_token && !config.api_key) {
      throw new Error('not-configured');
    }
    return { ok: true, mode: 'stub' };
  },
  async connect({ config }) {
    if (!config) throw new Error('not-configured');
    return { config, scopes: config.scopes || [] };
  },
  async refreshIfNeeded({ config }) {
    if (!config || !config.refresh_token) return;
  },
  async pullData({ config }) {
    if (!config) return [];
    return [];
  }
};
