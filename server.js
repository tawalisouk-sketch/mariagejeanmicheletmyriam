/**
 * Petit serveur : sert l'invitation, enregistre les RSVP (data.json)
 * la liste des invités (invites.json) et le suivi des ouvertures (opens.json). Aucun service externe.
 * Lancement : node server.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const INVITES_FILE = path.join(__dirname, 'invites.json');
const OPENS_FILE = path.join(__dirname, 'opens.json');

// Mot de passe pour ouvrir admin.html : changez-le avant de déployer
// (ou définissez la variable d'environnement ADMIN_KEY).
const ADMIN_KEY = process.env.ADMIN_KEY || 'change-moi';

[[DATA_FILE, '[]'], [INVITES_FILE, '[]'], [OPENS_FILE, '{}']].forEach(([f, init]) => { if (!fs.existsSync(f)) fs.writeFileSync(f, init, 'utf8'); });

const read = (f, dflt = []) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return dflt; } };
const norm = v => (v || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const write = (f, rows) => fs.writeFileSync(f, JSON.stringify(rows, null, 2), 'utf8');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg'
};

// Seuls ces fichiers sont publics (data.json, invites.json, opens.json et server.js ne le sont PAS).
function isPublic(rel) {
  return rel === '/index.html' || rel === '/admin.html' || rel === '/manifest.json' || rel === '/liens.html' || /^\/assets\/[\w.\-]+$/.test(rel);
}

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  if (!isPublic(rel)) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Introuvable'); }
  const filePath = path.join(__dirname, rel);
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Introuvable'); }
    const type = MIME[path.extname(filePath)] || 'application/octet-stream';
    const range = req.headers.range; // nécessaire pour la musique sur iPhone/Safari
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
      const start = m[1] ? parseInt(m[1], 10) : 0;
      const end = m[2] ? Math.min(parseInt(m[2], 10), st.size - 1) : st.size - 1;
      if (start > end || start >= st.size) { res.writeHead(416, { 'Content-Range': 'bytes */' + st.size }); return res.end(); }
      res.writeHead(206, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
      return fs.createReadStream(filePath, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': rel.startsWith('/assets/') ? 'public, max-age=86400' : 'no-cache' });
    fs.createReadStream(filePath).pipe(res);
  });
}

function readBody(req, cb) {
  let body = '';
  req.on('data', c => { body += c; if (body.length > 1e6) req.destroy(); });
  req.on('end', () => { try { cb(null, JSON.parse(body || '{}')); } catch (e) { cb(e); } });
}
const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
const s = (v, n) => (v || '').toString().trim().slice(0, n);

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const p = parsed.pathname;

  // RSVP : un invité répond (public)
  if (p === '/api/rsvps' && req.method === 'POST') {
    return readBody(req, (err, d) => {
      if (err) return json(res, 400, { ok: false, error: 'Données invalides' });
      const rows = read(DATA_FILE);
      rows.unshift({
        horodatage: new Date().toISOString(),
        nom: s(d.nom, 200), prenom: s(d.prenom, 200), telephone: s(d.telephone, 50),
        marie: d.marie === 'Oui' ? 'Oui' : 'Non', nom_epoux: s(d.nom_epoux, 200),
        presence: d.presence === 'Non' ? 'Non' : 'Oui', message: s(d.message, 2000), invite: s(d.invite, 200)
      });
      write(DATA_FILE, rows);
      json(res, 200, { ok: true });
    });
  }
  // RSVP : lecture réservée à l'admin
  if (p === '/api/rsvps' && req.method === 'GET') {
    if ((parsed.query.key || '') !== ADMIN_KEY) return json(res, 401, { ok: false, error: 'Mot de passe incorrect' });
    return json(res, 200, read(DATA_FILE));
  }

  // Suivi (public) : une invitation individuelle est ouverte / la page est en ligne
  if (p === '/api/track' && req.method === 'POST') {
    return readBody(req, (err, d) => {
      if (err) return json(res, 400, { ok: false });
      const nom = s(d.invite, 80), k = norm(nom);
      if (!k) return json(res, 400, { ok: false });
      const opens = read(OPENS_FILE, {}), now = Date.now();
      const o = opens[k] || (opens[k] = { nom, premiere: now, derniere: now, nb: 0, vu: now });
      o.vu = now;
      if (d.type === 'ouverture') { o.nb += 1; o.derniere = now; }
      write(OPENS_FILE, opens);
      json(res, 200, { ok: true });
    });
  }

  // ---- Admin (mot de passe) ----
  const isAdmin = (parsed.query.key || '') === ADMIN_KEY;
  if (p === '/api/admin/state' && req.method === 'GET') {
    if (!isAdmin) return json(res, 401, { ok: false, error: 'Mot de passe incorrect' });
    return json(res, 200, { now: Date.now(), invites: read(INVITES_FILE), opens: read(OPENS_FILE, {}), rsvps: read(DATA_FILE) });
  }
  if (p === '/api/admin/invites' && req.method === 'POST') {
    if (!isAdmin) return json(res, 401, { ok: false, error: 'Mot de passe incorrect' });
    return readBody(req, (err, d) => {
      if (err) return json(res, 400, { ok: false });
      const list = read(INVITES_FILE);
      if (d.supprimer) {
        const k = norm(d.supprimer);
        write(INVITES_FILE, list.filter(i => norm(i.nom) !== k));
        return json(res, 200, { ok: true });
      }
      const known = new Set(list.map(i => norm(i.nom)));
      (Array.isArray(d.noms) ? d.noms : []).forEach(n => {
        const nom = s(n, 80), k = norm(nom);
        if (k && !known.has(k)) { known.add(k); list.push({ nom, cree: new Date().toISOString() }); }
      });
      write(INVITES_FILE, list);
      json(res, 200, { ok: true, total: list.length });
    });
  }

  if (req.method === 'GET') return serveStatic(req, res, p);
  res.writeHead(405); res.end('Méthode non autorisée');
});

server.listen(PORT, () => console.log('Serveur démarré : http://localhost:' + PORT));
