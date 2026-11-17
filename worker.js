// Snake Neo — Static site worker + Score API (D1)
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    // Batas skor maksimal per tingkat kesulitan (anti-cheat)
    const MAX_SCORE = { easy: 5000, medium: 10000, hard: 20000 };

    // Pastikan tabel ada di D1 (hanya untuk permintaan API)
    if (path.startsWith('/api/')) {
      try {
        await env.DB.prepare(
          `CREATE TABLE IF NOT EXISTS scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            score INTEGER NOT NULL,
            diff TEXT NOT NULL,
            date TEXT NOT NULL
          )`
        ).run();
        await env.DB.prepare(
          `CREATE TABLE IF NOT EXISTS rate_limits (
            ip TEXT PRIMARY KEY,
            count INTEGER NOT NULL DEFAULT 0,
            window_start INTEGER NOT NULL
          )`
        ).run();
      } catch (e) {
        // Tabel sudah ada atau DB belum siap, abaikan
      }
    }

    // ---------- API: Leaderboard (10 teratas) ----------
    if (path === '/api/scores') {
      if (request.method === 'GET') {
        try {
          const diff = url.searchParams.get('diff');
          let query = 'SELECT name, score, diff, date FROM scores';
          const binds = [];
          if (diff && MAX_SCORE[diff]) {
            query += ' WHERE diff = ?';
            binds.push(diff);
          }
          query += ' ORDER BY score DESC, date DESC LIMIT 10';
          const { results } = await env.DB.prepare(query).bind(...binds).all();
          return Response.json({ scores: results || [], diff });
        } catch (e) {
          return Response.json({ error: 'DB error' }, { status: 500 });
        }
      }
      if (request.method === 'POST') {
        try {
          const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
          const now = Date.now();

          // Rate limiter per IP (maks 10 kirim per menit), tersimpan di D1
          try {
            const { results: row } = await env.DB.prepare(
              'SELECT count, window_start FROM rate_limits WHERE ip = ?'
            ).bind(ip).all();
            const r = row && row[0];
            if (r && now - r.window_start < 60 * 1000) {
              if (r.count >= 10) {
                return Response.json({ error: 'Too many requests' }, { status: 429 });
              }
              await env.DB.prepare(
                'UPDATE rate_limits SET count = count + 1 WHERE ip = ?'
              ).bind(ip).run();
            } else {
              await env.DB.prepare(
                'INSERT INTO rate_limits (ip, count, window_start) VALUES (?, 1, ?) ' +
                'ON CONFLICT(ip) DO UPDATE SET count = 1, window_start = excluded.window_start'
              ).bind(ip, now).run();
            }
          } catch (e) {
            // Rate limit gagal diambil, lanjutkan tanpa blokir
          }

          const { name, score, diff, date } = await request.json();
          if (typeof name !== 'string' || name.length < 1 || name.length > 20) {
            return Response.json({ error: 'Invalid name' }, { status: 400 });
          }
          if (!Number.isInteger(score) || score < 0) {
            return Response.json({ error: 'Invalid score' }, { status: 400 });
          }
          if (!MAX_SCORE[diff]) {
            return Response.json({ error: 'Invalid difficulty' }, { status: 400 });
          }
          if (score > MAX_SCORE[diff]) {
            return Response.json({ error: 'Score out of range' }, { status: 400 });
          }
          if (score % 10 !== 0) {
            return Response.json({ error: 'Score not achievable' }, { status: 400 });
          }
          const dateMs = Date.parse(date);
          if (isNaN(dateMs) || dateMs > now + 5 * 60 * 1000) {
            return Response.json({ error: 'Invalid date' }, { status: 400 });
          }
          // Cek duplikasi: sama nama, skor, difficulty, dan tanggal -> abaikan
          const { results: existing } = await env.DB.prepare(
            'SELECT id FROM scores WHERE name = ? AND score = ? AND diff = ? AND date = ? LIMIT 1'
          ).bind(name, score, diff, date).all();
          if (existing && existing.length > 0) {
            return Response.json({ ok: true, duplicate: true });
          }
          await env.DB.prepare(
            'INSERT INTO scores (name, score, diff, date) VALUES (?, ?, ?, ?)'
          ).bind(name, score, diff, date).run();
          return Response.json({ ok: true });
        } catch (e) {
          return Response.json({ error: 'DB error' }, { status: 500 });
        }
      }
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    // ---------- API: Riwayat lengkap (terbaru dulu) ----------
    if (path === '/api/scores/history') {
      if (request.method === 'GET') {
        try {
          const { results } = await env.DB.prepare(
            'SELECT name, score, diff, date FROM scores ORDER BY date DESC LIMIT 100'
          ).all();
          return Response.json({ scores: results || [] });
        } catch (e) {
          return Response.json({ error: 'DB error' }, { status: 500 });
        }
      }
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    // ---------- Aset statis ----------
    let response = await env.ASSETS.fetch(request);
    if (response.status === 404 && !path.includes('.')) {
      response = await env.ASSETS.fetch(new Request('index.html', request));
    }
    return response;
  }
};
