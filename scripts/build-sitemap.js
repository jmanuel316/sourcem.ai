// Sitemap + robots.txt generator. Run during npm run build.
const fs = require('fs');
const path = require('path');

const ORIGIN = process.env.PUBLIC_URL || 'https://sourcem.ai';
const routes = [
  '/', '/pricing', '/signup', '/login',
  '/terms', '/privacy', '/cookies', '/dpa', '/subprocessors', '/status', '/contact',
  '/help', '/help/articles/what-is-a-signal-score', '/help/articles/connect-crm',
  '/help/articles/import-spreadsheet', '/help/articles/set-up-solidify',
  '/help/articles/execute-seats', '/help/articles/cancel-or-pause'
];

const now = new Date().toISOString().slice(0, 10);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes.map(r => `  <url><loc>${ORIGIN}${r}</loc><lastmod>${now}</lastmod></url>`).join('\n')}
</urlset>`;

const robots = `User-agent: *
Allow: /
Sitemap: ${ORIGIN}/sitemap.xml
`;

fs.writeFileSync(path.join(__dirname, '..', 'public', 'sitemap.xml'), sitemap);
fs.writeFileSync(path.join(__dirname, '..', 'public', 'robots.txt'), robots);
console.log('[sitemap] wrote sitemap.xml + robots.txt');
