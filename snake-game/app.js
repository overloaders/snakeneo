/* ============================
   Snake Neo — Game Logic
   Suara, animasi, tingkat kesulitan
   ============================ */

(async function () {
  'use strict';

  // ---------- Elemen DOM ----------
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  const screenMenu   = document.getElementById('menu');
  const screenGame   = document.getElementById('game');

  const elMenuBest   = document.getElementById('menu-best');
  const elScore      = document.getElementById('score');
  const elHigh       = document.getElementById('high');
  const elLength     = document.getElementById('length');
  const elDiffBadge  = document.getElementById('diff-badge');
  const elSoundIcon  = document.getElementById('sound-indicator');
  const elFinalScore = document.getElementById('final-score');
  const elFinalHigh  = document.getElementById('final-high');
  const elTopScores        = document.getElementById('top-scores-list');
  const elHistoryList      = document.getElementById('history-list');
  const elPlayerName       = document.getElementById('player-name');
  const btnSaveScore       = document.getElementById('btn-save-score');
  const btnShareScore      = document.getElementById('btn-share-score');
  const elLeaderboardList  = document.getElementById('leaderboard-list');
  const elLeaderboardHist  = document.getElementById('leaderboard-history');
  const screenLeaderboard  = document.getElementById('leaderboard');

  const btnStart           = document.getElementById('btn-start');
  const btnPause           = document.getElementById('btn-pause');
  const btnResume          = document.getElementById('btn-resume');
  const btnRestart         = document.getElementById('btn-restart');
  const btnMenu            = document.getElementById('btn-menu');
  const btnLeaderboard     = document.getElementById('btn-leaderboard');
  const btnLeaderboardBack = document.getElementById('btn-leaderboard-back');
  const soundToggle  = document.getElementById('sound-toggle');

  const dpadBtns = document.querySelectorAll('.dpad-btn');
  const diffBtns = document.querySelectorAll('.diff-btn');
  const themeBtns = document.querySelectorAll('.theme-btn');

  const overlayPause   = document.getElementById('overlay-pause');
  const overlayGameOver= document.getElementById('overlay-gameover');
  const flashEl = document.createElement('div');
  flashEl.className = 'flash';
  document.querySelector('.stage').appendChild(flashEl);

  // ---------- Konfigurasi ----------
  const GRID = 20;
  const COLS = canvas.width / GRID;
  const ROWS = canvas.height / GRID;

  const DIFF = {
    easy:  { label: 'Mudah',   speed: 220, step: 2 },
    medium:{ label: 'Sedang',  speed: 150, step: 4 },
    hard:  { label: 'Sulit',   speed: 100, step: 6 },
  };

  const THEME = {
    hijau:  { head: '#22c55e', body: '#16a34a', food: '#ef4444', particle: '#22c55e' },
    biru:   { head: '#3b82f6', body: '#2563eb', food: '#ef4444', particle: '#3b82f6' },
    ungu:   { head: '#a855f7', body: '#7e22ce', food: '#ef4444', particle: '#a855f7' },
    merah:  { head: '#f43f5e', body: '#e11d48', food: '#ef4444', particle: '#f43f5e' },
    kuning: { head: '#facc15', body: '#ca8a04', food: '#ef4444', particle: '#facc15' },
  };

  let score = 0;
  let highScore = 0;
  let length = 3;
  let speed = DIFF.medium.speed;
  let diffStep = DIFF.medium.step;
  let currentDiff = 'medium';
  let soundEnabled = true;
  let allHistory = [];

  // ---------- API (multiplayer / shared leaderboard) ----------
  async function apiPostScores(entry) {
    try {
      const res = await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
      if (!res.ok) throw new Error('POST failed');
      return await res.json();
    } catch (e) {
      console.warn('Gagal menyimpan skor ke server', e);
    }
  }

  async function apiGetScores(diff) {
    try {
      const url = diff ? '/api/scores?diff=' + diff : '/api/scores';
      const res = await fetch(url);
      if (!res.ok) throw new Error('GET failed');
      const data = await res.json();
      return data.scores || [];
    } catch (e) {
      console.warn('Gagal memuat skor dari server', e);
      return [];
    }
  }

  async function apiGetHistory() {
    try {
      const res = await fetch('/api/scores/history');
      if (!res.ok) throw new Error('GET history failed');
      const data = await res.json();
      return data.scores || [];
    } catch (e) {
      console.warn('Gagal memuat riwayat dari server', e);
      return [];
    }
  }

  let snake = [];
  let food = { x: 0, y: 0 };
  let currentTheme = 'hijau';
  let dir = { x: 0, y: 0 };
  let nextDir = { x: 0, y: 0 };
  let isPaused = false;
  let isRunning = false;
  let lastTime = 0;
  let accumulator = 0;
  let lastSaveTime = 0;
  const SAVE_INTERVAL = 3000; // simpan state setiap 3 detik
  const OFFLINE_QUEUE_KEY = 'snake_neo_offline_queue';

  // ---------- Antrian skor offline ----------
  function bacaAntrianOffline() {
    try {
      const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function simpanAntrianOffline(antrian) {
    try { localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(antrian)); } catch (e) {}
  }

  function masukkanAntrianOffline(entry) {
    const antrian = bacaAntrianOffline();
    antrian.push(entry);
    simpanAntrianOffline(antrian);
  }

  async function sinkronkanAntrianOffline() {
    if (!navigator.onLine) return;
    const antrian = bacaAntrianOffline();
    if (antrian.length === 0) return;
    const tersisa = [];
    for (const entry of antrian) {
      try {
        const res = await fetch('/api/scores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry),
        });
        if (!res.ok) {
          tersisa.push(entry);
          continue;
        }
        await res.json();
      } catch (e) {
        tersisa.push(entry);
      }
    }
    simpanAntrianOffline(tersisa);
    await loadHistoryFromDB();
  }

  // ---------- Gamepad ----------
  const GAMEPAD_DEADZONE = 0.3;
  const GAMEPAD_COOLDOWN = 150; // ms
  let lastGamepadTime = 0;

  // ---------- Partikel animasi ----------
  let particles = [];

  function spawnParticle(x, y, color) {
    for (let i = 0; i < 6; i++) {
      particles.push({
        x: x * GRID + GRID / 2,
        y: y * GRID + GRID / 2,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4,
        life: 1.0,
        color: color
      });
    }
  }

  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.05;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function drawParticles() {
    particles.forEach(p => {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
  }

  // ---------- Suara via Web Audio ----------
  let audioCtx = null;
  let audioReady = false;

  async function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
    audioReady = true;
  }

  function playTone(freq, type, duration, vol = 0.15) {
    if (!soundEnabled || !audioCtx || !audioReady) return;
    try {
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      gain.setValueAtTime(vol, t);
      gain.exponentialRampToValueAtTime(0.001, t + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + duration);
    } catch (e) {
      // audio gagal diputar, jangan hentikan permainan
    }
  }

  let soundIconTimer = null;

  function showSoundIcon() {
    if (!soundEnabled || !elSoundIcon) return;
    elSoundIcon.classList.add('playing');
    if (soundIconTimer) clearTimeout(soundIconTimer);
    soundIconTimer = setTimeout(() => {
      elSoundIcon.classList.remove('playing');
      soundIconTimer = null;
    }, 300);
  }

  async function sfxEat()   { try { await initAudio(); playTone(900, 'square', 0.10, 0.15); showSoundIcon(); } catch (e) {} }
  async function sfxDie()   { try { await initAudio(); playTone(150, 'sawtooth', 0.40, 0.18); playTone(110, 'sawtooth', 0.45, 0.15); showSoundIcon(); } catch (e) {} }

  // Inisialisasi AudioContext pada interaksi pengguna pertama (wajib browser modern)
  btnStart.addEventListener('click', async (e) => { e.preventDefault(); await initAudio(); resetGame(); });

  // ---------- Tema warna ----------
  try {
    const savedTheme = localStorage.getItem('snake_neo_theme');
    if (savedTheme && THEME[savedTheme]) currentTheme = savedTheme;
  } catch (e) { currentTheme = 'hijau'; }

  function applyTheme(theme) {
    currentTheme = theme;
    try { localStorage.setItem('snake_neo_theme', theme); } catch (e) {}
    themeBtns.forEach(b => b.classList.toggle('active', b.dataset.theme === theme));
  }

  themeBtns.forEach(b => {
    b.addEventListener('click', () => {
      themeBtns.forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      applyTheme(b.dataset.theme);
    });
  });

  // ---------- High score ----------
  try {
    highScore = parseInt(localStorage.getItem('snake_neo_high') || '0', 10) || 0;
  } catch (e) { highScore = 0; }
  elMenuBest.textContent = highScore;
  elHigh.textContent = highScore;

  // Ingat nama pemain terakhir
  try {
    const savedName = localStorage.getItem('snake_neo_name');
    if (savedName && elPlayerName) elPlayerName.value = savedName;
  } catch (e) { /* localStorage gagal, biarkan default */ }

  // ---------- Riwayat 5 skor tertinggi ----------
  function renderTopScores(list) {
    if (!elTopScores) return;
    elTopScores.innerHTML = '';
    const sorted = list.slice().sort((a, b) => b.score - a.score);
    const top5 = sorted.slice(0, 5);
    if (top5.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'Belum ada rekor';
      elTopScores.appendChild(li);
      return;
    }
    top5.forEach((entry, i) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="rank">#${i + 1}</span><span class="value">${entry.score}</span><span class="date">${entry.name || 'Pemain'}</span>`;
      elTopScores.appendChild(li);
    });
  }

  function renderHistory(list) {
    if (!elHistoryList) return;
    elHistoryList.innerHTML = '';
    const sorted = list.slice().sort((a, b) => b.score - a.score);
    if (sorted.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'Belum ada riwayat';
      elHistoryList.appendChild(li);
      return;
    }
    sorted.forEach((entry, i) => {
      const li = document.createElement('li');
      const d = new Date(entry.date || 0);
      const tgl = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      li.innerHTML = `<span class="rank">#${i + 1}</span><span class="value">${entry.score}</span><span class="date">${entry.name || 'Pemain'} · ${tgl}</span>`;
      elHistoryList.appendChild(li);
    });
  }

  function renderLeaderboard(list) {
    if (!elLeaderboardList) return;
    elLeaderboardList.innerHTML = '';
    const sorted = list.slice().sort((a, b) => b.score - a.score);
    const top10 = sorted.slice(0, 10);
    if (top10.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'Belum ada rekor';
      elLeaderboardList.appendChild(li);
      return;
    }
    const medal = i => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
    top10.forEach((entry, i) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="rank">${medal(i)} #${i + 1}</span><span class="value">${entry.score}</span><span class="date">${entry.name || 'Pemain'}</span>`;
      elLeaderboardList.appendChild(li);
    });
  }

  function renderLeaderboardHistory(list) {
    if (!elLeaderboardHist) return;
    elLeaderboardHist.innerHTML = '';
    const sorted = list.slice().sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    if (sorted.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'Belum ada riwayat';
      elLeaderboardHist.appendChild(li);
      return;
    }
    sorted.forEach((entry, i) => {
      const li = document.createElement('li');
      const d = new Date(entry.date || 0);
      const tgl = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      li.innerHTML = `<span class="value">${entry.score}</span><span class="date">${entry.name || 'Pemain'} · ${entry.diff === 'easy' ? 'Mudah' : entry.diff === 'hard' ? 'Sulit' : 'Sedang'} · ${tgl}</span>`;
      elLeaderboardHist.appendChild(li);
    });
  }

  async function loadHistoryFromDB() {
    try {
      allHistory = await apiGetScores();
      allHistory.sort((a, b) => b.score - a.score);
      renderTopScores(allHistory);
      renderHistory(allHistory);
      renderLeaderboard(allHistory);

      // High score dari server (global)
      if (allHistory.length > 0) {
        highScore = allHistory[0].score;
        elMenuBest.textContent = highScore;
        elHigh.textContent = highScore;
      }

      // Personal best per difficulty dari localStorage
      Object.keys(DIFF).forEach(d => {
        try {
          const pb = parseInt(localStorage.getItem('snake_neo_pb_' + d) || '0', 10) || 0;
          const el = document.getElementById('pb-' + d);
          if (el) el.textContent = pb;
        } catch (e) {}
      });
    } catch (e) {
      console.warn('Gagal memuat riwayat dari server', e);
    }
  }

  async function loadLeaderboardByDiff(diff) {
    try {
      const scores = await apiGetScores(diff);
      scores.sort((a, b) => b.score - a.score);
      renderLeaderboard(scores);
      renderLeaderboardHistory(scores);
      const el = document.getElementById('lb-title');
      if (el) el.textContent = diff === 'easy' ? 'Mudah' : diff === 'hard' ? 'Sulit' : 'Sedang';
    } catch (e) {
      console.warn('Gagal memuat leaderboard per difficulty', e);
    }
  }

  await loadHistoryFromDB();
  await sinkronkanAntrianOffline();

  // Coba restore state game yang tersimpan
  const btnResumeSaved = document.getElementById('btn-resume-saved');
  const hasSavedState = restoreGameState();
  if (btnResumeSaved) {
    btnResumeSaved.style.display = hasSavedState ? 'block' : 'none';
    btnResumeSaved.addEventListener('click', async (e) => {
      e.preventDefault();
      await initAudio();
      isRunning = true;
      isPaused = false;
      lastTime = performance.now();
      accumulator = 0;
      elScore.textContent = score;
      elLength.textContent = length;
      showScreen(screenGame);
      overlayGameOver.classList.add('hidden');
      overlayPause.classList.add('hidden');
      requestAnimationFrame(loop);
    });
  }

  // ---------- Difficulty ----------
  function applyDiff(diff) {
    currentDiff = diff;
    const d = DIFF[diff];
    speed = d.speed;
    diffStep = d.step;
    elDiffBadge.textContent = d.label;
    diffBtns.forEach(b => b.classList.toggle('active', b.dataset.diff === diff));
  }

  diffBtns.forEach(b => {
    b.addEventListener('click', () => {
      diffBtns.forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      applyDiff(b.dataset.diff);
    });
  });

  applyDiff(currentDiff);

  // ---------- Sound toggle ----------
  soundToggle.addEventListener('change', () => {
    soundEnabled = soundToggle.checked;
  });

  // ---------- Dark mode toggle ----------
  const darkModeToggle = document.getElementById('dark-mode-toggle');
  const root = document.documentElement;

  try {
    const savedDark = localStorage.getItem('snake_neo_dark');
    if (savedDark === '1') {
      root.classList.add('dark');
      darkModeToggle.checked = true;
      darkModeToggle.setAttribute('aria-checked', 'true');
    }
  } catch (e) {}

  darkModeToggle.addEventListener('change', () => {
    if (darkModeToggle.checked) {
      root.classList.add('dark');
      darkModeToggle.setAttribute('aria-checked', 'true');
      try { localStorage.setItem('snake_neo_dark', '1'); } catch (e) {}
    } else {
      root.classList.remove('dark');
      darkModeToggle.setAttribute('aria-checked', 'false');
      try { localStorage.setItem('snake_neo_dark', '0'); } catch (e) {}
    }
  });

  // ---------- Util ----------
  function randomCell() { return Math.floor(Math.random() * COLS); }

  function placeFood() {
    let valid = false;
    while (!valid) {
      food.x = randomCell();
      food.y = randomCell();
      valid = !snake.some(seg => seg.x === food.x && seg.y === food.y);
    }
  }

  function saveGameState() {
    if (!isRunning) return;
    try {
      localStorage.setItem('snake_neo_state', JSON.stringify({
        snake,
        food,
        score,
        length,
        speed,
        diffStep,
        currentDiff,
        dir,
        nextDir,
        particles,
      }));
    } catch (e) {}
  }

  function restoreGameState() {
    try {
      const raw = localStorage.getItem('snake_neo_state');
      if (!raw) return false;
      const state = JSON.parse(raw);
      snake = state.snake;
      food = state.food;
      score = state.score;
      length = state.length;
      speed = state.speed;
      diffStep = state.diffStep;
      currentDiff = state.currentDiff;
      dir = state.dir;
      nextDir = state.nextDir;
      particles = state.particles;
      elScore.textContent = score;
      elLength.textContent = length;
      applyDiff(currentDiff);
      return true;
    } catch (e) {
      return false;
    }
  }

  function resetGame() {
    const start = Math.floor(COLS / 2);
    snake = [
      { x: start, y: Math.floor(ROWS / 2) },
      { x: start - 1, y: Math.floor(ROWS / 2) },
      { x: start - 2, y: Math.floor(ROWS / 2) }
    ];
    dir = { x: 1, y: 0 };
    nextDir = { x: 1, y: 0 };
    score = 0;
    length = 3;
    particles = [];
    isPaused = false;
    isRunning = true;
    accumulator = 0;
    lastTime = performance.now();

    elScore.textContent = '0';
    elLength.textContent = length;
    placeFood();

    showScreen(screenGame);
    overlayPause.classList.add('hidden');
    overlayGameOver.classList.add('hidden');
    flashEl.classList.remove('active');

    requestAnimationFrame(loop);
  }

  async function gameOver() {
    isRunning = false;
    saveGameState();
    sfxDie();
    flashEl.classList.add('active');
    setTimeout(() => flashEl.classList.remove('active'), 180);

    // Tampilkan kembali tombol simpan untuk sesi game over baru
    if (btnSaveScore) btnSaveScore.style.display = '';

    if (score > highScore) {
      highScore = score;
      elMenuBest.textContent = highScore;
      elHigh.textContent = highScore;
    }

    elFinalScore.textContent = score;
    elFinalHigh.textContent = highScore;

    overlayGameOver.classList.remove('hidden');
  }

  async function saveScore() {
    const playerName = (elPlayerName && elPlayerName.value.trim()) ? elPlayerName.value.trim() : 'Pemain';
    try { localStorage.setItem('snake_neo_name', playerName); } catch (e) {}

    const entry = {
      name: playerName,
      score: score,
      diff: currentDiff,
      date: new Date().toISOString(),
    };

    const saved = await apiPostScores(entry);
    if (!saved || !saved.ok) {
      // Simpan ke antrian offline agar tidak hilang saat jaringan putus
      masukkanAntrianOffline(entry);
      throw new Error('Gagal menyimpan skor ke server');
    }

    // Sembunyikan tombol setelah menyimpan berhasil mencegah spam
    if (btnSaveScore) btnSaveScore.style.display = 'none';

    // Simpan personal best per difficulty ke localStorage
    try {
      const pbKey = 'snake_neo_pb_' + currentDiff;
      const currentPb = parseInt(localStorage.getItem(pbKey) || '0', 10) || 0;
      if (score > currentPb) {
        localStorage.setItem(pbKey, String(score));
      }
    } catch (e) {}

    await loadHistoryFromDB();
  }

  async function shareScore() {
    const text = `Saya dapat skor ${score} di Snake Neo (${currentDiff === 'easy' ? 'Mudah' : currentDiff === 'hard' ? 'Sulit' : 'Sedang'})!`;
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Skor Saya — Snake Neo', text, url });
      } else {
        await navigator.clipboard.writeText(text + ' ' + url);
        alert('Teks disalin ke clipboard');
      }
    } catch (e) {
      // User membatalkan atau share tidak didukung
    }
  }

  function togglePause() {
    if (!isRunning) return;
    isPaused = !isPaused;
    overlayPause.classList.toggle('hidden', !isPaused);
    if (isPaused) {
      saveGameState();
    } else {
      lastTime = performance.now();
      requestAnimationFrame(loop);
    }
  }

  // ---------- Input ----------
  function setDirection(dx, dy) {
    if (dx === -dir.x && dy === -dir.y) return;
    nextDir = { x: dx, y: dy };
  }

  function bindButton(btn, dx, dy) {
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); setDirection(dx, dy); }, { passive: false });
    btn.addEventListener('click', (e) => { e.preventDefault(); setDirection(dx, dy); });
  }

  bindButton(document.querySelector('[data-dir="up"]'), 0, -1);
  bindButton(document.querySelector('[data-dir="down"]'), 0, 1);
  bindButton(document.querySelector('[data-dir="left"]'), -1, 0);
  bindButton(document.querySelector('[data-dir="right"]'), 1, 0);

  let touchStartX = 0, touchStartY = 0, touchStartTime = 0;
  canvas.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    touchStartX = t.clientX; touchStartY = t.clientY;
    touchStartTime = performance.now();
  }, { passive: true });

  canvas.addEventListener('touchend', (e) => {
    if (!isRunning || isPaused) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX, dy = t.clientY - touchStartY;
    const dt = performance.now() - touchStartTime;
    const dist = Math.hypot(dx, dy);
    if (dt < 400 && dist > 20) {
      setDirection(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : -1) : 0,
                   Math.abs(dx) > Math.abs(dy) ? 0 : (dy > 0 ? 1 : -1));
    }
  }, { passive: true });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp')    { e.preventDefault(); setDirection(0, -1); }
    if (e.key === 'ArrowDown')  { e.preventDefault(); setDirection(0, 1); }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); setDirection(-1, 0); }
    if (e.key === 'ArrowRight') { e.preventDefault(); setDirection(1, 0); }
    if (e.key === ' ' || e.key === 'Escape') { e.preventDefault(); togglePause(); }
  });

  // ---------- Render ----------
  function drawCell(x, y, color, glow = true) {
    ctx.fillStyle = color;
    if (glow) { ctx.shadowColor = color; ctx.shadowBlur = 8; }
    ctx.fillRect(x * GRID + 1, y * GRID + 1, GRID - 2, GRID - 2);
    ctx.shadowBlur = 0;
  }

  function drawGrid() {
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let i = 0; i <= COLS; i++) {
      ctx.beginPath(); ctx.moveTo(i * GRID, 0); ctx.lineTo(i * GRID, canvas.height); ctx.stroke();
    }
    for (let j = 0; j <= ROWS; j++) {
      ctx.beginPath(); ctx.moveTo(0, j * GRID); ctx.lineTo(canvas.width, j * GRID); ctx.stroke();
    }
  }

  function draw() {
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawGrid();

    const t = THEME[currentTheme];

    drawCell(food.x, food.y, t.food, true);

    snake.forEach((seg, i) => {
      const isHead = i === 0;
      const c = isHead ? t.head : t.body;
      drawCell(seg.x, seg.y, c, isHead);
      if (isHead) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(seg.x * GRID + 14, seg.y * GRID + 6, 2.5, 0, Math.PI * 2);
        ctx.arc(seg.x * GRID + 14, seg.y * GRID + 14, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    updateParticles();
    drawParticles();
  }

  // ---------- Game loop ----------
  function loop(now) {
    if (!isRunning) return;
    if (isPaused) { lastTime = now; requestAnimationFrame(loop); return; }

    const dt = now - lastTime;
    lastTime = now;
    accumulator += dt;

    if (accumulator >= speed) {
      accumulator = 0;
      update();
    }

    // Debounce simpan state game setiap SAVE_INTERVAL ms
    if (now - lastSaveTime >= SAVE_INTERVAL) {
      lastSaveTime = now;
      saveGameState();
    }

    handleGamepad(now);

    draw();
    requestAnimationFrame(loop);
  }

  function handleGamepad(now) {
    if (!navigator.getGamepads) return;
    const gamepads = navigator.getGamepads();
    const gp = gamepads[0];
    if (!gp || now - lastGamepadTime < GAMEPAD_COOLDOWN) return;

    let dx = 0;
    let dy = 0;
    if (Math.abs(gp.axes[0]) > GAMEPAD_DEADZONE) {
      dx = gp.axes[0] > 0 ? 1 : -1;
    } else if (Math.abs(gp.axes[1]) > GAMEPAD_DEADZONE) {
      dy = gp.axes[1] > 0 ? 1 : -1;
    } else if (gp.buttons[12]?.pressed) dy = -1; // d-pad up
    else if (gp.buttons[13]?.pressed) dy = 1;  // d-pad down
    else if (gp.buttons[14]?.pressed) dx = -1; // d-pad left
    else if (gp.buttons[15]?.pressed) dx = 1;  // d-pad right

    if (dx !== 0 || dy !== 0) {
      lastGamepadTime = now;
      setDirection(dx, dy);
    }
  }

  function update() {
    dir = nextDir;
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS ||
        snake.some(seg => seg.x === head.x && seg.y === head.y)) {
      gameOver();
      return;
    }

    snake.unshift(head);

    if (head.x === food.x && head.y === food.y) {
      sfxEat();
      spawnParticle(head.x, head.y, THEME[currentTheme].particle);
      score += 10;
      length += 1;
      elScore.textContent = score;
      elLength.textContent = length;
      speed = Math.max(45, speed - diffStep);
      placeFood();
    } else {
      snake.pop();
    }
  }

  // ---------- Navigasi ----------
  function showScreen(screen) {
    [screenMenu, screenGame, screenLeaderboard].forEach(s => s.classList.remove('active'));
    screen.classList.add('active');
  }

  // ---------- Events ----------
  btnRestart.addEventListener('click', (e) => { e.preventDefault(); resetGame(); });
  btnMenu.addEventListener('click', (e) => { e.preventDefault(); showScreen(screenMenu); overlayGameOver.classList.add('hidden'); });
  btnSaveScore.addEventListener('click', async (e) => {
    e.preventDefault();
    // Nonaktifkan segera mencegah double-click / spam saat proses async
    if (btnSaveScore) {
      btnSaveScore.style.display = 'none';
      btnSaveScore.disabled = true;
    }
    try {
      await saveScore();
    } catch (err) {
      // Jika simpan gagal (jaringan error, server 500, dll),
      // tunjukkan dan aktifkan kembali tombol agar pemain bisa coba ulang
      if (btnSaveScore) {
        btnSaveScore.style.display = '';
        btnSaveScore.disabled = false;
      }
    }
  });

  if (btnShareScore) {
    btnShareScore.addEventListener('click', async (e) => {
      e.preventDefault();
      await shareScore();
    });
  }

  btnLeaderboard.addEventListener('click', async (e) => {
    e.preventDefault();
    allHistory = await apiGetHistory();
    renderLeaderboard(allHistory);
    renderLeaderboardHistory(allHistory);
    showScreen(screenLeaderboard);
  });

  btnLeaderboardBack.addEventListener('click', (e) => {
    e.preventDefault();
    showScreen(screenMenu);
  });

  btnPause.addEventListener('click', (e) => { e.preventDefault(); togglePause(); });
  btnResume.addEventListener('click', (e) => { e.preventDefault(); togglePause(); });

  window.__setLbDiff = async (diff) => {
    // Update active state tombol
    const btns = document.querySelectorAll('#leaderboard .diff-btn');
    btns.forEach(b => b.classList.toggle('active', b.dataset.diff === diff));
    await loadLeaderboardByDiff(diff);
  };

  // Sinkronkan antrian offline saat kembali online
  window.addEventListener('online', sinkronkanAntrianOffline);

  showScreen(screenMenu);
})();
