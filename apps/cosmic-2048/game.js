/* ============================================
   宇宙天体图鉴 2048 — 游戏逻辑
   纯原生 JS，无依赖，无外部请求
   ============================================ */

(function () {
  'use strict';

  var SIZE = 4;
  var STORE_KEY = 'mass-ladder-2048/v1';
  var WIN_LEVEL = 17;

  // 标尺范围（log10 M/kg）
  var SCALE_MIN = 15;
  var SCALE_MAX = 53.5;

  var BODIES = [];       // 从 bodies.json 载入
  var META = null;

  var state = {
    grid: [],            // 二维数组，0 = 空，否则为 level(1..11)
    score: 0,
    best: 0,
    maxLevel: 0,
    seen: {},            // 已解锁等级
    over: false,
    won: false,
    keepPlaying: false,
    prev: null           // 撤销快照
  };

  var factQueue = [];
  var factOpen = false;
  var celebrating = false;
  var celebrateLevels = {};
  var playerName = '观测者';
  var cosmicBackdropLevel = -1;

  /* ---------- 工具 ---------- */

  function $(id) { return document.getElementById(id); }

  function body(level) { return BODIES[level - 1]; }

  // 把 kg 质量格式化为科学计数法（真上标）
  function fmtMass(kg) {
    var e = Math.floor(Math.log10(kg));
    var m = kg / Math.pow(10, e);
    return m.toFixed(2) + '×10' + sup(e) + ' kg';
  }

  // 可读性优先的写法：10 小、指数大（用于侧栏等需要看清数字的位置）
  function fmtMassBig(kg) {
    var e = Math.floor(Math.log10(kg));
    var m = kg / Math.pow(10, e);
    return m.toFixed(2) + '×<i>10</i><b>' + e + '</b> kg';
  }

  // 密度：极小/极大值用科学计数法
  function fmtDensity(d) {
    if (d > 0 && (d < 0.01 || d >= 100000)) {
      var e = Math.floor(Math.log10(d));
      return (d / Math.pow(10, e)).toFixed(1) + '×10' + sup(e) + ' kg/m³';
    }
    return d.toLocaleString('en-US') + ' kg/m³';
  }

  // 半径同样紧凑化
  function fmtRadius(km) {
    if (km >= 10000) {
      var e = Math.floor(Math.log10(km));
      return (km / Math.pow(10, e)).toFixed(1) + '×10' + sup(e) + ' km';
    }
    return km.toLocaleString('en-US') + ' km';
  }

  /* ---------- 天体渲染 ---------- */

  function orbClass(b) { return 'orb orb--' + b.render; }

  function orbStyle(b) {
    var c2 = shade(b.color_primary, -0.45);
    return '--orb-c1:' + b.color_primary +
           ';--orb-c2:' + c2 +
           ';--orb-glow:' + b.color_glow + ';';
  }

  // 用真实天体贴图渲染；无 sprite 时回退到 CSS 渐变球
  function makeOrb(b, cls) {
    cls = cls || 'orb';
    if (b.sprite) {
      var img = document.createElement('img');
      img.className = cls + ' ' + cls + '--img';
      img.src = b.sprite;
      img.alt = b.name;
      img.draggable = false;
      img.loading = 'eager';
      img.decoding = 'async';
      return img;
    }
    var d = document.createElement('div');
    d.className = cls + ' orb--' + b.render;
    d.setAttribute('style', orbStyle(b));
    return d;
  }

  // 简单的颜色明暗调整
  function shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    function adj(v) {
      return Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
    }
    return '#' + ((1 << 24) + (adj(r) << 16) + (adj(g) << 8) + adj(b)).toString(16).slice(1);
  }

  /* ---------- 棋盘核心 ---------- */

  function emptyGrid() {
    var g = [];
    for (var r = 0; r < SIZE; r++) {
      g.push([0, 0, 0, 0]);
    }
    return g;
  }

  function cloneGrid(g) {
    return g.map(function (row) { return row.slice(); });
  }

  function emptyCells(g) {
    var out = [];
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (g[r][c] === 0) out.push([r, c]);
      }
    }
    return out;
  }

  function spawn(g) {
    var cells = emptyCells(g);
    if (!cells.length) return false;
    var pick = cells[Math.floor(Math.random() * cells.length)];
    // 90% 出 1 级（尘埃团），10% 出 2 级（彗核）
    g[pick[0]][pick[1]] = Math.random() < 0.9 ? 1 : 2;
    return true;
  }

  // 把一行向左压缩合并，返回 {row, gained, merges}
  function slideRow(row) {
    var vals = row.filter(function (v) { return v !== 0; });
    var out = [];
    var gained = 0;
    var merges = [];
    var i = 0;
    while (i < vals.length) {
      if (i + 1 < vals.length && vals[i] === vals[i + 1] && vals[i] < WIN_LEVEL) {
        var nl = vals[i] + 1;
        out.push(nl);
        gained += Math.pow(2, nl);
        merges.push({ index: out.length - 1, level: nl });
        i += 2;
      } else {
        out.push(vals[i]);
        i += 1;
      }
    }
    while (out.length < SIZE) out.push(0);
    return { row: out, gained: gained, merges: merges };
  }

  // 方向：0=左 1=上 2=右 3=下
  function rotate(g, times) {
    var res = cloneGrid(g);
    for (var t = 0; t < times; t++) {
      var n = emptyGrid();
      for (var r = 0; r < SIZE; r++) {
        for (var c = 0; c < SIZE; c++) {
          n[c][SIZE - 1 - r] = res[r][c];
        }
      }
      res = n;
    }
    return res;
  }

  function move(dir) {
    if (state.over) return false;

    var snapshot = {
      grid: cloneGrid(state.grid),
      score: state.score,
      maxLevel: state.maxLevel
    };

    // 旋转使目标方向变为"向左"
    var rotIn = [0, 3, 2, 1][dir];
    var rotOut = [0, 1, 2, 3][dir];

    var g = rotate(state.grid, rotIn);
    var gained = 0;
    var mergedCells = [];
    var changed = false;

    for (var r = 0; r < SIZE; r++) {
      var before = g[r].slice();
      var res = slideRow(g[r]);
      g[r] = res.row;
      gained += res.gained;
      res.merges.forEach(function (m) {
        mergedCells.push({ r: r, c: m.index, level: m.level });
      });
      for (var c = 0; c < SIZE; c++) {
        if (before[c] !== g[r][c]) changed = true;
      }
    }

    if (!changed) return false;

    // 记录合并位置（旋转回去）
    var markSet = {};
    mergedCells.forEach(function (m) {
      var rr = m.r, cc = m.c;
      for (var t = 0; t < rotOut; t++) {
        var nr = cc, nc = SIZE - 1 - rr;
        rr = nr; cc = nc;
      }
      markSet[rr + ',' + cc] = true;
    });

    state.grid = rotate(g, rotOut);
    state.score += gained;
    state.prev = snapshot;

    if (gained > 0) showGain(gained);

    // 新解锁的等级
    var newLevels = [];
    mergedCells.forEach(function (m) {
      if (!state.seen[m.level]) {
        state.seen[m.level] = true;
        newLevels.push(m.level);
      }
      if (m.level > state.maxLevel) state.maxLevel = m.level;
    });

    // 初始等级也计入图鉴
    for (var r2 = 0; r2 < SIZE; r2++) {
      for (var c2 = 0; c2 < SIZE; c2++) {
        var lv = state.grid[r2][c2];
        if (lv && !state.seen[lv]) {
          state.seen[lv] = true;
          newLevels.push(lv);
        }
        if (lv > state.maxLevel) state.maxLevel = lv;
      }
    }

    spawn(state.grid);

    if (state.score > state.best) state.best = state.score;

    render(markSet);
    save();

    newLevels.sort(function (a, b) { return a - b; });
    celebrateLevels = {};
    newLevels.forEach(function (lv) {
      celebrateLevels[lv] = true;
      factQueue.push(lv);
    });
    if (newLevels.length) render(markSet);   // 重绘以附加庆祝脉冲
    flushFacts();

    if (state.maxLevel >= WIN_LEVEL && !state.won) {
      state.won = true;
      setTimeout(function () { showOverlay(true); }, 420);
    } else if (!canMove(state.grid)) {
      state.over = true;
      setTimeout(function () { showOverlay(false); }, 260);
    }

    return true;
  }

  function canMove(g) {
    if (emptyCells(g).length) return true;
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var v = g[r][c];
        if (v >= WIN_LEVEL) continue;
        if (c + 1 < SIZE && g[r][c + 1] === v) return true;
        if (r + 1 < SIZE && g[r + 1][c] === v) return true;
      }
    }
    return false;
  }

  function undo() {
    if (!state.prev) return;
    state.grid = cloneGrid(state.prev.grid);
    state.score = state.prev.score;
    state.maxLevel = state.prev.maxLevel;
    state.prev = null;
    state.over = false;
    hideOverlay();
    render({});
    save();
  }

  /* ---------- 渲染 ---------- */

  function buildGridBg() {
    var bg = $('grid-bg');
    bg.innerHTML = '';
    for (var i = 0; i < SIZE * SIZE; i++) {
      var d = document.createElement('div');
      d.className = 'cell';
      bg.appendChild(d);
    }
  }

  // 用当前最高等级天体贴图更新整屏星空底图。
  function renderCosmicBackdrop() {
    if (state.maxLevel === cosmicBackdropLevel) return;
    cosmicBackdropLevel = state.maxLevel;

    var page = document.body;
    if (state.maxLevel < 1) {
      page.style.removeProperty('--cosmic-object-image');
      page.style.removeProperty('--cosmic-object-glow');
      page.removeAttribute('data-cosmic-level');
      return;
    }

    var b = body(state.maxLevel);
    if (!b) return;
    page.style.setProperty('--cosmic-object-image', b.sprite ? 'url("' + b.sprite + '")' : 'none');
    page.style.setProperty('--cosmic-object-glow', b.color_glow || 'rgba(110,190,255,.48)');
    page.setAttribute('data-cosmic-level', String(state.maxLevel));
  }

  function render(markSet) {
    markSet = markSet || {};
    renderCosmicBackdrop();
    var layer = $('tile-layer');
    layer.innerHTML = '';

    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var lv = state.grid[r][c];
        var slot = document.createElement('div');
        if (!lv) {
          slot.style.visibility = 'hidden';
          layer.appendChild(slot);
          continue;
        }
        var b = body(lv);
        var mk = markSet[r + ',' + c];
        slot.className = 'tile'
          + (mk ? ' tile--merged' : '')
          + (mk && celebrateLevels[lv] ? ' tile--celebrate' : '');
        slot.dataset.lv = lv;

        var orb = makeOrb(b, 'orb');

        var label = document.createElement('div');
        label.className = 'tile-label';
        label.textContent = b.name;

        // 质量量级：10 为小号底数，指数为大号主体，便于直接比大小
        var exp = document.createElement('div');
        exp.className = 'tile-exp';
        var base = document.createElement('span');
        base.className = 'exp-base';
        base.textContent = '10';
        var pow = document.createElement('span');
        pow.className = 'exp-pow';
        pow.textContent = (b.display_exp != null ? b.display_exp : Math.round(b.log_mass));
        exp.appendChild(base);
        exp.appendChild(pow);
        exp.setAttribute('aria-label', '10 的 ' + (b.display_exp != null ? b.display_exp : Math.round(b.log_mass)) + ' 次方 千克');

        // 左上角级数角标
        var rank = document.createElement('span');
        rank.className = 'tile-rank';
        rank.textContent = lv + '/17';

        slot.appendChild(rank);
        slot.appendChild(orb);
        slot.appendChild(label);
        slot.appendChild(exp);
        layer.appendChild(slot);
      }
    }

    var scEl = $('score');
    if (scEl.textContent !== String(state.score)) {
      scEl.classList.remove('score-value--bump');
      void scEl.offsetWidth;
      scEl.classList.add('score-value--bump');
    }
    scEl.textContent = state.score;
    $('best').textContent = state.best;

    var discovered = BODIES.reduce(function (count, b, index) {
      return count + (state.seen[index + 1] ? 1 : 0);
    }, 0);
    $('collection-count').textContent = discovered + ' / ' + BODIES.length;

    renderScale();
    renderNext();
    $('btn-undo').disabled = !state.prev;
  }

  // 物理门槛提示（接在对应的晋级步骤上）
  var GATES = {
    5:  '核心达到氢聚变条件，天体开始<strong>自行发光</strong>',
    7:  '从单一天体迈向<strong>由引力束缚的恒星系统</strong>',
    10: '进入星系尺度，<strong>暗物质晕成为重要组成</strong>',
    11: '经典 2048 达成——但这不是终点',
    13: '星系团是宇宙中<strong>最大的引力束缚结构</strong>',
    17: '图鉴终章：<strong>可观测宇宙</strong>'
  };

  function renderNext() {
    var cur = state.maxLevel;
    var orb = $('next-orb');
    if (cur >= WIN_LEVEL) {
      var finalBody = body(WIN_LEVEL);
      orb.className = 'next-orb';
      orb.removeAttribute('style');
      orb.innerHTML = '';
      orb.appendChild(makeOrb(finalBody, 'orb'));
      $('next-name').textContent = '可观测宇宙';
      $('next-mass').textContent = '图鉴 17 / 17';
      $('next-gate').innerHTML = '宇宙图鉴已收录完成；仍可继续游玩。';
      return;
    }
    var nx = body(Math.max(1, cur) + (cur >= 1 ? 1 : 0));
    if (cur < 1) nx = body(2);
    orb.className = 'next-orb';
    orb.removeAttribute('style');
    orb.innerHTML = '';
    orb.appendChild(makeOrb(nx, 'orb'));
    $('next-name').textContent = nx.name;
    $('next-mass').innerHTML = fmtMassBig(nx.mass);
    $('next-gate').innerHTML = GATES[nx.level] || '';
  }

  function renderScale() {
    var pct = 0, name = '—', massTxt = '—';
    if (state.maxLevel >= 1) {
      var b = body(state.maxLevel);
      pct = (b.log_mass - SCALE_MIN) / (SCALE_MAX - SCALE_MIN) * 100;
      pct = Math.max(1.5, Math.min(100, pct));
      name = b.name;
      massTxt = fmtMassBig(b.mass);
    }
    $('scale-fill').style.height = pct + '%';
    $('scale-marker').style.bottom = pct + '%';
    $('readout-name').textContent = name;
    $('readout-mass').innerHTML = massTxt;

    // 刻度高亮
    var ticks = $('scale-ticks').children;
    for (var i = 0; i < ticks.length; i++) {
      var tv = parseFloat(ticks[i].dataset.v);
      ticks[i].classList.toggle('tick--hit',
        state.maxLevel >= 1 && tv <= body(state.maxLevel).log_mass);
    }
  }

  function buildTicks() {
    var wrap = $('scale-ticks');
    wrap.innerHTML = '';
    var marks = [20, 25, 30, 35, 40, 45, 50, 53];
    for (var i = 0; i < marks.length; i++) {
      var v = marks[i];
      var pct = (v - SCALE_MIN) / (SCALE_MAX - SCALE_MIN) * 100;
      var t = document.createElement('div');
      t.className = 'tick';
      t.style.bottom = pct + '%';
      t.dataset.v = v;
      // 用正常字号的数字代替上标，保证可读
      var lab = document.createElement('span');
      lab.className = 'tick-label';
      lab.innerHTML = '<i>10</i><b>' + v + '</b>';
      t.appendChild(lab);
      wrap.appendChild(t);
    }
  }

  var SUPS = { '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹' };
  function sup(n) {
    return String(n).split('').map(function (ch) { return SUPS[ch] || ch; }).join('');
  }


  /* ---------- 开场欢迎页 ---------- */

  var NAME_KEY = 'mass-ladder-2048/player';
  var GUIDE_KEY = 'mass-ladder-2048/guide-seen';

  function hasSeenGuide() {
    try { return localStorage.getItem(GUIDE_KEY) === '1'; } catch (e) { return false; }
  }

  function openGuide() {
    $('guide-modal').hidden = false;
    try { localStorage.setItem(GUIDE_KEY, '1'); } catch (e) { /* 隐私模式忽略 */ }
  }

  function closeGuide() {
    $('guide-modal').hidden = true;
  }

  function loadName() {
    try { return localStorage.getItem(NAME_KEY) || ''; } catch (e) { return ''; }
  }

  function saveName(n) {
    try { localStorage.setItem(NAME_KEY, n); } catch (e) { /* 隐私模式忽略 */ }
  }

  function applyName(n) {
    playerName = n || '观测者';
    var el = $('player-name');
    if (el) el.textContent = playerName;
  }

  function enterGame(name) {
    var clean = (name || '').trim().replace(/\s+/g, ' ').slice(0, 12);
    applyName(clean);
    if (clean) saveName(clean);

    var w = $('welcome');
    var app = $('app');
    w.classList.add('welcome--out');
    app.classList.remove('app--hidden');
    app.classList.add('app--in');
    setTimeout(function () { w.hidden = true; }, 600);
    if (!hasSeenGuide()) openGuide();
  }

  function initWelcome() {
    var saved = loadName();
    var input = $('nickname');
    var note = $('welcome-note');
    if (saved) {
      input.value = saved;
      note.textContent = '欢迎回来，' + saved;
    }
    applyName(saved);

    function go() {
      var v = input.value.trim();
      // 简单校验：不允许纯符号
      if (v && !/[\u4e00-\u9fa5a-zA-Z0-9]/.test(v)) {
        note.textContent = '称号里至少要有一个文字或数字';
        note.classList.add('welcome-note--warn');
        input.focus();
        return;
      }
      note.classList.remove('welcome-note--warn');
      enterGame(v);
    }

    $('btn-enter').addEventListener('click', go);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); go(); }
    });
    input.addEventListener('input', function () {
      note.textContent = '留空将使用默认称号';
      note.classList.remove('welcome-note--warn');
    });
    setTimeout(function () { input.focus(); }, 700);
  }

  /* ---------- 分数飘字 ---------- */

  function showGain(n) {
    var wrap = document.querySelector('.board-wrap');
    if (!wrap) return;
    var el = document.createElement('div');
    el.className = 'float-gain';
    el.textContent = '+' + n;
    wrap.appendChild(el);
    setTimeout(function () { el.remove(); }, 1100);
  }

  /* ---------- 新天体庆祝动画 ---------- */

  var celTimer = null;

  function celebrate(lv, done) {
    var b = body(lv);
    var el = $('celebrate');
    if (!el) { if (done) done(); return; }

    var isFinal = (lv >= WIN_LEVEL);
    var color = b.color_primary || '#ffd66b';
    var glow = b.color_glow || 'rgba(255,214,107,.35)';

    el.className = 'celebrate' + (isFinal ? ' celebrate--final' : '');
    el.style.setProperty('--cel-color', color);
    el.style.setProperty('--cel-glow', glow);

    $('cel-kicker').textContent = isFinal ? '标尺尽头 · 2¹⁷ 达成' : '新天体解锁 · 第 ' + lv + ' 级';
    $('cel-name').textContent = b.name;
    var exp = $('cel-exp');
    exp.innerHTML = '';
    var expBase = document.createElement('span');
    expBase.textContent = '10';
    var expPower = document.createElement('sup');
    expPower.textContent = b.display_exp != null ? b.display_exp : Math.round(b.log_mass);
    expPower.style.fontSize = '.72em';
    expPower.style.lineHeight = '0';
    expPower.style.verticalAlign = 'super';
    exp.appendChild(expBase);
    exp.appendChild(expPower);
    exp.appendChild(document.createTextNode(' kg · ' + b.representative));

    // 生成粒子
    var wrap = $('cel-particles');
    wrap.innerHTML = '';
    var n = isFinal ? 46 : 28;
    for (var i = 0; i < n; i++) {
      var p = document.createElement('span');
      var ang = (Math.PI * 2 * i) / n + (Math.random() - 0.5) * 0.4;
      var r = (isFinal ? 150 : 108) * (0.55 + Math.random() * 0.75);
      p.className = 'cel-p';
      p.style.setProperty('--px', (Math.cos(ang) * r).toFixed(1) + 'px');
      p.style.setProperty('--py', (Math.sin(ang) * r).toFixed(1) + 'px');
      p.style.setProperty('--ps', (3 + Math.random() * 4).toFixed(1) + 'px');
      p.style.setProperty('--pc', Math.random() < 0.34 ? '#ffffff' : color);
      p.style.setProperty('--pd', (0.8 + Math.random() * 0.6).toFixed(2) + 's');
      p.style.setProperty('--pdelay', (Math.random() * 0.22).toFixed(2) + 's');
      wrap.appendChild(p);
    }

    // 重启 CSS 动画
    el.hidden = false;
    void el.offsetWidth;

    clearTimeout(celTimer);
    celTimer = setTimeout(function () {
      el.hidden = true;
      if (done) done();
    }, isFinal ? 2600 : 2200);
  }

  /* ---------- 科普卡 ---------- */

  function flushFacts() {
    if (factOpen || celebrating || !factQueue.length) return;
    var lv = factQueue.shift();
    celebrating = true;
    celebrate(lv, function () {
      celebrating = false;
      showFact(lv);
    });
  }

  function showFact(lv) {
    var b = body(lv);
    factOpen = true;

    var orbWrap = $('fact-orb');
    orbWrap.className = 'fact-orb';
    orbWrap.removeAttribute('style');
    orbWrap.innerHTML = '';
    orbWrap.appendChild(makeOrb(b, 'orb'));

    $('fact-badge').textContent = lv === WIN_LEVEL ? '图鉴终章 · 2048' : '新天体解锁 · 第 ' + lv + ' 级';
    $('fact-name').textContent = b.name;
    $('fact-rep').textContent = '代表天体：' + b.representative;

    var stats = [
      ['质量', fmtMass(b.mass)],
      ['量级', '10' + sup(b.display_exp != null ? b.display_exp : Math.round(b.log_mass))],
      ['密度', fmtDensity(b.density)]
    ];
    if (b.T_eff) stats.push(['有效温度', b.T_eff + ' K']);
    if (b.radius_km) stats.push(['半径', fmtRadius(b.radius_km)]);

    $('fact-stats').innerHTML = stats.map(function (s) {
      return '<div class="stat-chip"><span class="stat-chip-key">' + s[0] +
             '</span><span class="stat-chip-val">' + s[1] + '</span></div>';
    }).join('');

    $('fact-title').textContent = b.fact_title;
    $('fact-text').textContent = b.fact;
    $('fact-physics').textContent = '关键物理 · ' + b.key_physics;

    $('fact-modal').hidden = false;
  }

  function closeFact() {
    $('fact-modal').hidden = true;
    factOpen = false;
    renderCodex();
    setTimeout(flushFacts, 90);
  }

  /* ---------- 图鉴 ---------- */

  function renderCodex() {
    var list = $('codex-list');
    list.innerHTML = '';
    var got = 0;

    BODIES.forEach(function (b, i) {
      var lv = i + 1;
      var unlocked = !!state.seen[lv];
      if (unlocked) got++;

      var row = document.createElement('div');
      row.className = 'codex-row' + (unlocked ? '' : ' codex-row--locked');

      var lvEl = document.createElement('span');
      lvEl.className = 'codex-lv';
      lvEl.textContent = lv;

      var orb;
      if (unlocked) {
        orb = makeOrb(b, 'codex-orb');
      } else {
        orb = document.createElement('div');
        orb.className = 'codex-orb';
      }

      var info = document.createElement('div');
      info.className = 'codex-info';
      var nm = document.createElement('span');
      nm.className = 'codex-name';
      nm.textContent = unlocked ? b.name : '??????';
      var rp = document.createElement('span');
      rp.className = 'codex-rep';
      rp.textContent = unlocked ? b.representative : '尚未解锁';
      info.appendChild(nm);
      info.appendChild(rp);

      var ms = document.createElement('span');
      ms.className = 'codex-mass';
      ms.textContent = unlocked ? '10' + sup(b.display_exp != null ? b.display_exp : Math.round(b.log_mass)) + ' kg' : '—';

      row.appendChild(lvEl);
      row.appendChild(orb);
      row.appendChild(info);
      row.appendChild(ms);

      if (unlocked) {
        row.style.cursor = 'pointer';
        row.addEventListener('click', function () {
          $('codex-modal').hidden = true;
          showFact(lv);
        });
      }

      list.appendChild(row);
    });

    $('codex-progress').textContent = got + ' / ' + BODIES.length;
  }

  /* ---------- 覆盖层 ---------- */

  function showOverlay(isWin) {
    var ov = $('overlay');
    if (isWin) {
      $('overlay-title').textContent = '🌌 宇宙图鉴达成';
      $('overlay-text').textContent =
        '你通过不断合并，解锁了从小行星到可观测宇宙的全部天体等级。' +
        '宇宙图鉴已收录完成，仍可继续游玩并探索每一种天体。';
      $('overlay-continue').hidden = false;
    } else {
      $('overlay-title').textContent = '合并之旅暂时停下';
      var b = state.maxLevel ? body(state.maxLevel) : null;
      $('overlay-text').textContent = b
        ? '棋盘已满，暂时无法继续合并。当前最高天体是' + b.name +
          '（' + fmtMass(b.mass) + '）；当前图鉴进度为 ' +
          $('collection-count').textContent + '。'
        : '棋盘已满，暂时无法继续合并。';
      $('overlay-continue').hidden = true;
    }
    ov.hidden = false;
  }

  function hideOverlay() { $('overlay').hidden = true; }

  /* ---------- 关于面板 ---------- */

  function buildAbout() {
    var srcs = META.sources.map(function (s) {
      return '<li>' + s + '</li>';
    }).join('');

    $('about-body').innerHTML =
      '<h4>为什么是 17 级</h4>' +
      '<p>4×4 棋盘的理论极限是 <code>2¹⁷ = 131072</code>。合成 2ⁿ 需要两个 2ⁿ⁻¹，' +
      '而第二个 2ⁿ⁻¹ 被造出来之前，第一个必须原地占格等待——递归下去形成一条必须同时在场的阶梯链。' +
      '最深时刻棋盘上要同时容纳 2ⁿ⁻¹ 到 2³ 共 14 格，加上两个刷新出的 4，正好填满 16 格。' +
      '而 2¹⁸ 需要 17 格，<strong>永远不可能</strong>。</p>' +
      '<p>所以本游戏定为 17 级：<strong>棋盘的数学极限，恰好对应宇宙的结构极限</strong>。</p>' +

      '<h4>合并与天体图鉴</h4>' +
      '<p>游戏把 2048 的合并规则映射到天体图鉴：合并两个同级天体后，会解锁一个质量更大的天体。' +
      '这是用于探索天体层级的游戏化设定，不模拟真实碰撞、天体演化或质量守恒。' +
      '右侧质量尺度与图鉴条目展示各类天体的实际质量，供科普参考。</p>' +

      '<h4>从恒星到宇宙结构</h4>' +
      '<ul>' +
      '<li><strong>恒星阶段</strong>：核心条件达到氢聚变门槛后，天体便能持续自行发光。</li>' +
      '<li><strong>星团阶段</strong>：图鉴从单一天体延伸到由引力联系在一起的恒星系统。</li>' +
      '<li><strong>宇宙结构阶段</strong>：继续探索星系、星系团与宇宙网等更大尺度的结构。</li>' +
      '</ul>' +

      '<h4>暗物质与宇宙结构</h4>' +
      '<p>当图鉴从恒星扩展到星系，暗物质晕成为理解其整体结构的重要部分。' +
      '图鉴中的质量数值包含可见物质与暗物质等天文估算。</p>' +

      '<h4>计分与收集</h4>' +
      '<p><strong>得分</strong>沿用 2048 规则；<strong>图鉴进度</strong>记录已经解锁的天体等级。' +
      '收集进度会保存在本地，开启新游戏后仍可继续补全图鉴。</p>' +

      '<h4>数据来源</h4>' +
      '<ul class="src-list">' + srcs + '</ul>' +

      '<h4>技术</h4>' +
      '<p>纯静态单页应用，原生 HTML / CSS / JS，零第三方依赖、零网络请求。' +
      '天体贴图由 AI 生成，形态与配色依据 NASA / ESA / EHT 观测影像与各天体实测参数设定，' +
      '<strong>非真实观测照片</strong>。进度用 <code>localStorage</code> 本地保存。</p>';
  }

  /* ---------- 存档 ---------- */

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        grid: state.grid,
        score: state.score,
        best: state.best,
        maxLevel: state.maxLevel,
        seen: state.seen,
        won: state.won,
        keepPlaying: state.keepPlaying
      }));
    } catch (e) { /* 隐私模式下忽略 */ }
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return false;
      var d = JSON.parse(raw);
      if (!d || !Array.isArray(d.grid) || d.grid.length !== SIZE) return false;
      state.grid = d.grid;
      state.score = d.score || 0;
      state.best = d.best || 0;
      state.maxLevel = d.maxLevel || 0;
      state.seen = d.seen || {};
      state.won = !!d.won;
      state.keepPlaying = !!d.keepPlaying;
      return true;
    } catch (e) { return false; }
  }

  function newGame() {
    state.grid = emptyGrid();
    state.score = 0;
    state.maxLevel = 0;
    state.over = false;
    state.won = false;
    state.keepPlaying = false;
    state.prev = null;
    spawn(state.grid);
    spawn(state.grid);
    // 初始天体计入图鉴
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var lv = state.grid[r][c];
        if (lv) {
          state.seen[lv] = true;
          if (lv > state.maxLevel) state.maxLevel = lv;
        }
      }
    }
    hideOverlay();
    render({});
    renderCodex();
    save();
  }

  function clearUnlockCache() {
    var confirmed = window.confirm(
      '清除已解锁天体记录并立即开始新游戏吗？之后再次合成到这些天体时，会重新播放解锁动画和介绍弹窗。最高分与玩家称号会保留。'
    );
    if (!confirmed) return;

    clearTimeout(celTimer);
    $('celebrate').hidden = true;
    factQueue = [];
    celebrateLevels = {};
    celebrating = false;
    state.seen = {};
    newGame();
  }

  /* ---------- 输入 ---------- */

  var KEYMAP = {
    ArrowLeft: 0, ArrowUp: 1, ArrowRight: 2, ArrowDown: 3,
    a: 0, w: 1, d: 2, s: 3,
    A: 0, W: 1, D: 2, S: 3,
    h: 0, k: 1, l: 2, j: 3
  };

  function bindInput() {
    document.addEventListener('keydown', function (e) {
      if (!$('fact-modal').hidden || !$('guide-modal').hidden || !$('codex-modal').hidden || !$('about-modal').hidden) {
        if (e.key === 'Escape') {
          if (!$('fact-modal').hidden) closeFact();
          else if (!$('guide-modal').hidden) closeGuide();
          else if (!$('codex-modal').hidden) $('codex-modal').hidden = true;
          else if (!$('about-modal').hidden) $('about-modal').hidden = true;
        }
        return;
      }
      var dir = KEYMAP[e.key];
      if (dir === undefined) return;
      e.preventDefault();
      move(dir);
    });

    // 触摸滑动
    var sx = 0, sy = 0, tracking = false;
    var wrap = document.querySelector('.board-wrap');

    wrap.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
      tracking = true;
    }, { passive: true });

    wrap.addEventListener('touchmove', function (e) {
      if (tracking) e.preventDefault();
    }, { passive: false });

    wrap.addEventListener('touchend', function (e) {
      if (!tracking) return;
      tracking = false;
      var t = e.changedTouches[0];
      var dx = t.clientX - sx, dy = t.clientY - sy;
      var ax = Math.abs(dx), ay = Math.abs(dy);
      if (Math.max(ax, ay) < 24) return;
      if (ax > ay) move(dx > 0 ? 2 : 0);
      else move(dy > 0 ? 3 : 1);
    }, { passive: true });

    // 按钮
    $('btn-new').addEventListener('click', newGame);
    $('btn-undo').addEventListener('click', undo);
    $('btn-clear-cache').addEventListener('click', clearUnlockCache);
    $('btn-guide').addEventListener('click', openGuide);
    $('guide-close').addEventListener('click', closeGuide);
    $('guide-start').addEventListener('click', closeGuide);

    $('btn-codex').addEventListener('click', function () {
      renderCodex();
      $('codex-modal').hidden = false;
    });
    $('codex-close').addEventListener('click', function () {
      $('codex-modal').hidden = true;
    });

    $('btn-about').addEventListener('click', function () {
      $('about-modal').hidden = false;
    });
    $('about-close').addEventListener('click', function () {
      $('about-modal').hidden = true;
    });

    $('fact-close').addEventListener('click', closeFact);

    $('overlay-retry').addEventListener('click', newGame);
    $('overlay-continue').addEventListener('click', function () {
      state.keepPlaying = true;
      hideOverlay();
      save();
    });

    // 点遮罩关闭
    ['guide-modal', 'codex-modal', 'about-modal'].forEach(function (id) {
      $(id).addEventListener('click', function (e) {
        if (e.target === this) this.hidden = true;
      });
    });
    $('fact-modal').addEventListener('click', function (e) {
      if (e.target === this) closeFact();
    });
  }

  /* ---------- 启动 ---------- */

  // bodies.json 以内联方式回退，保证 file:// 直接打开也能跑
  function boot(data) {
    META = data.meta;
    BODIES = data.levels;

    buildGridBg();
    buildTicks();
    buildAbout();
    bindInput();
    initWelcome();

    if (load()) {
      state.over = !canMove(state.grid);
      render({});
      renderCodex();
      if (state.over) showOverlay(false);
    } else {
      newGame();
    }
  }

  function init() {
    fetch('data/bodies.json')
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(boot)
      .catch(function () {
        // fetch 失败（如 file:// 协议）时使用内联副本
        if (window.__BODIES_FALLBACK__) {
          boot(window.__BODIES_FALLBACK__);
        } else {
          document.body.insertAdjacentHTML('afterbegin',
            '<p style="padding:16px;color:#ff8a8a">天体数据加载失败，请通过 HTTP 服务访问本页面。</p>');
        }
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
