// Google Sheets provider — uses default stub.
// The Sheets import reads from the gmail provider's stored OAuth tokens
// (services/import.js:commitSheetsImportOAuth), but this stub keeps the
// generic connect/refresh flow working.
module.exports = require('./_default');
