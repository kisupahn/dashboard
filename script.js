function updateClock() {
  var now = new Date();
  document.getElementById('clock').textContent = now.toLocaleTimeString('ko-KR');
  var date = document.getElementById('date');
  if (date) date.textContent = now.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' });
}
updateClock(); setInterval(updateClock, 1000);

(function () {
  'use strict';
  var defaultRelayUrl = 'https://script.google.com/macros/s/AKfycbwBtccv4cEjgbfxSxXCHvtbYnOI7QNQcjB1AT_PGDfqDCWtB7f7vXVeFb13JLKDF9n4hA/exec';
  var storageKey = 'seoul-transit-settings-v1';
  var screenStorageKey = 'seoul-dashboard-screen-v1', activeScreen = 'transit';
  try { var savedScreen = localStorage.getItem(screenStorageKey); if (savedScreen === 'menu' || savedScreen === 'trot') activeScreen = savedScreen; } catch (_) {}
  var fields = ['relayUrl', 'interval', 'textScale', 'newsUrl'];
  var settings = { relayUrl: defaultRelayUrl, relayToken: '', station: '노들/9/공항방향',  arsId: '20726/동작08, 20014/360', interval: 60, textScale: 135, newsEnabled: true, newsUrl: TransitNews.defaultURL };
  var timer, generation = 0, controllers = [], autoCount = 0, awaitingManual = false;
  var client = TransitAPI.createClient();
  var $ = function (id) { return document.getElementById(id); };
  try {
    var saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (saved && typeof saved === 'object') {
      ['relayUrl', 'relayToken', 'interval', 'textScale', 'refreshPolicy', 'station', 'arsId', 'newsUrl'].forEach(function (key) { if (typeof saved[key] === 'string' || typeof saved[key] === 'number') settings[key] = saved[key]; });
      if (typeof saved.newsEnabled === 'boolean') settings.newsEnabled = saved.newsEnabled;
      if (Array.isArray(saved.stops)) settings.stops = saved.stops;
    }
  } catch (_) { $('saveStatus').textContent = '저장 정보를 읽지 못했습니다. 다시 입력하세요.'; }
  if (!settings.relayUrl) settings.relayUrl = defaultRelayUrl;
  // Apply the requested one-minute interval once to existing saved settings.
  if (settings.refreshPolicy !== '60s-90') settings.interval = 60;
  settings.refreshPolicy = '60s-90';
  settings.interval = Math.min(3600, Math.max(30, Number(settings.interval) || 60));
  fields.forEach(function (key) { $(key).value = settings[key]; });
  var editingToken = false;
  function lockToken() {
    editingToken = false;
    $('relayToken').value = ''; $('relayToken').disabled = true; $('relayToken').required = false;
    $('relayToken').placeholder = settings.relayToken ? '저장됨' : '미설정';
    $('editTokenBtn').textContent = settings.relayToken ? '수정하기' : '입력하기';
    $('editTokenBtn').setAttribute('aria-expanded', 'false');
  }
  lockToken();
  $('editTokenBtn').onclick = function () {
    if (editingToken) { lockToken(); return; }
    editingToken = true;
    $('relayToken').value = ''; $('relayToken').disabled = false; $('relayToken').required = true;
    $('relayToken').placeholder = '새 접속 코드'; $('relayToken').focus();
    $('editTokenBtn').textContent = '취소'; $('editTokenBtn').setAttribute('aria-expanded', 'true');
  };
  var newsSignature = '';
  function renderNews() {
    if (activeScreen !== 'transit') { $('newsPanel').hidden = true; return; }
    $('newsEnabled').checked = settings.newsEnabled; $('newsUrl').value = settings.newsUrl;
    var news = null;
    try { if (settings.newsEnabled) news = TransitNews.source(settings.newsUrl); }
    catch (_) { $('saveStatus').textContent = '설정에서 뉴스 영상 주소를 확인하세요.'; }
    $('newsPanel').hidden = !news;
    var nextSignature = news ? news.embedURL : '';
    if (newsSignature === nextSignature) return;
    newsSignature = nextSignature; $('newsPlayer').textContent = '';
    if (!news) return;
    $('newsLink').href = news.watchURL;
    var frame = document.createElement('iframe'); frame.title = '뉴스 영상 재생';
    frame.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen');
    frame.setAttribute('allowfullscreen', ''); frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    frame.src = news.embedURL; $('newsPlayer').appendChild(frame);
  }
  renderNews();
  function applyTextScale(value) {
    var scale = Math.min(180, Math.max(100, Number(value) || 135));
    document.documentElement.style.setProperty('--text-scale', String(scale / 100));
    $('textScale').value = scale; $('textScaleValue').textContent = scale + '%';
    return scale;
  }
  settings.textScale = applyTextScale(settings.textScale);
  $('textScale').oninput = function () { applyTextScale(this.value); };
  settings.stops = TransitAPI.migrateStops(settings);
  var draft = [];
  function button(text, action) {
    var node = document.createElement('button'); node.type = 'button'; node.textContent = text; node.onclick = action; return node;
  }
  function renderEditor() {
    var container = $('stopEditor'); container.textContent = '';
    draft.forEach(function (stop, index) {
      var box = document.createElement('fieldset'); box.className = 'stop-editor';
      var legend = document.createElement('legend'); legend.textContent = '정류장 ' + (index + 1); box.appendChild(legend);
      var actions = document.createElement('div'); actions.className = 'stop-actions';
      var up = button('↑', function () { var x = draft[index - 1]; draft[index - 1] = stop; draft[index] = x; renderEditor(); }); up.disabled = index === 0; up.setAttribute('aria-label', '정류장 ' + (index + 1) + ' 위로');
      var down = button('↓', function () { var x = draft[index + 1]; draft[index + 1] = stop; draft[index] = x; renderEditor(); }); down.disabled = index === draft.length - 1; down.setAttribute('aria-label', '정류장 ' + (index + 1) + ' 아래로');
      actions.appendChild(up); actions.appendChild(down); actions.appendChild(button('삭제', function () { draft.splice(index, 1); renderEditor(); })); box.appendChild(actions);
      var entry = document.createElement('div'); entry.className = 'stop-fields';
      var choice = button(stop.type === 'bus' ? '버스' : '지하철', function () {
        stop.type = stop.type === 'bus' ? 'subway' : 'bus'; stop.location = ''; stop.condition = ''; renderEditor();
      }); choice.className = 'type-toggle';
      choice.setAttribute('aria-label', (stop.type === 'bus' ? '현재 버스, 지하철로 전환' : '현재 지하철, 버스로 전환'));
      entry.appendChild(choice);
      function field(title, key, placeholder) {
        var label = document.createElement('label');
        var caption = document.createElement('span'); caption.className = 'sr-only'; caption.textContent = title; label.appendChild(caption);
        var input = document.createElement('input'); input.value = stop[key]; input.placeholder = placeholder; input.required = true;
        input.oninput = function () { stop[key] = input.value; }; label.appendChild(input); entry.appendChild(label);
      }
      field('정류장명 또는 코드', 'location', stop.type === 'bus' ? '정류장명·코드' : '역명');
      field('노선 및 방향', 'condition', stop.type === 'bus' ? '노선 (쉼표로 여러 개)' : '호선·방향');
      box.appendChild(entry);
      container.appendChild(box);
    });
  }
  function editStops() { draft = TransitAPI.migrateStops(settings); renderEditor(); }
  editStops();
  $('addStopBtn').onclick = function () { draft.push({ type: 'bus', location: '', condition: '' }); renderEditor(); };
  $('fullscreenBtn').onclick = async function () {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else { $('saveStatus').textContent = '이 브라우저는 전체화면 전환을 지원하지 않습니다.'; return; }
      $('saveStatus').textContent = '';
    } catch (_) { $('saveStatus').textContent = '브라우저에서 전체화면 전환을 허용하지 않았습니다.'; }
  };
  function toggle(open) {
    $('settings').hidden = !open;
    $('settingsBtn').setAttribute('aria-expanded', String(open));
    lockToken();
    if (open) { applyTextScale(settings.textScale); $('newsEnabled').checked = settings.newsEnabled; $('newsUrl').value = settings.newsUrl; editStops(); $('closeSettingsBtn').focus(); }
    else { applyTextScale(settings.textScale); $('settingsBtn').focus(); }
  }
  $('settingsBtn').onclick = function () { toggle($('settings').hidden); };
  $('closeSettingsBtn').onclick = function () { toggle(false); };
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && !$('settings').hidden) toggle(false); });
  function makeCard(group) {
    var target = group;
    var article = document.createElement('article'); article.className = 'transit-card ' + target.type;
    var cardHead = document.createElement('div'); cardHead.className = 'card-head';
    var icon = document.createElement('span'); icon.className = 'transport-icon';
    icon.setAttribute('role', 'img'); icon.setAttribute('aria-label', target.type === 'bus' ? '버스' : '지하철');
    icon.innerHTML = target.type === 'bus'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="5" y="3" width="14" height="15" rx="3"/><path d="M5 10h14M8 3v7M8 18v3m8-3v3"/><circle cx="8.5" cy="14.5" r=".9" fill="currentColor"/><circle cx="15.5" cy="14.5" r=".9" fill="currentColor"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="6" y="3" width="12" height="15" rx="4"/><path d="M6 10h12M9 18l-3 3m9-3 3 3M10 6h4"/><circle cx="9" cy="14" r=".8" fill="currentColor"/><circle cx="15" cy="14" r=".8" fill="currentColor"/></svg>';
    var heading = document.createElement('h2'); heading.textContent = TransitAPI.label(target);
    cardHead.appendChild(icon); cardHead.appendChild(heading);
    var status = document.createElement('p'); status.className = 'loading'; status.setAttribute('role', 'status'); status.textContent = '(로딩중)';
    var arrivals = document.createElement('div'); arrivals.className = 'arrivals';
    article.appendChild(cardHead); article.appendChild(status); article.appendChild(arrivals);
    $('arrivalPanels').appendChild(article);
    var card = { element: article, target: target, views: group.targets.map(function (t) { return { target: t, items: [], pending: true, error: '' }; }), heading: heading, status: status, arrivals: arrivals, ticks: [], items: [] };
    render(card);
    return card;
  }
  function concise(message) {
    if (message === '예정 시각 경과 · 새 정보 대기') return '';
    var text = message.replace(/^약\s*/, '');
    var duration = text.match(/^(\d+)분(?:\s*(\d+)초)?/);
    if (duration) return duration[1] + '분' + (duration[2] ? ' ' + duration[2] + '초' : '');
    return text.replace(/\s*후(?:\s*\([^)]*\))?$/, '');
  }
  function render(card) {
    var contentKey = JSON.stringify(card.views.map(function (v) { return { items: v.items, error: v.error }; }));
    card.status.hidden = !card.views.some(function (view) { return view.pending; });
    if (card.contentKey === contentKey) return;
    card.contentKey = contentKey;
    card.arrivals.textContent = ''; card.ticks = [];
    card.items = [];
    card.views.forEach(function (view) { card.items = card.items.concat(view.items); });
    card.status.hidden = !card.views.some(function (view) { return view.pending; });
    TransitAPI.routeRows(card.views).forEach(function (route) {
      var row = document.createElement('div'); row.className = 'route-row';
      var name = document.createElement('h3'); name.className = 'route-name' + (route.colorClass ? ' ' + route.colorClass : '');
      if (route.lineName) {
        var line = document.createElement('span'); line.textContent = route.lineName;
        var destination = document.createElement('small'); destination.className = 'destination'; destination.textContent = route.destination;
        name.appendChild(line); name.appendChild(destination);
      } else name.textContent = route.name;
      row.appendChild(name);
      route.slots.forEach(function (slot, index) {
        var cell = document.createElement('div'); cell.className = 'arrival';
        cell.setAttribute('aria-label', index === 0 ? '가장 가까운 도착' : '다음 도착');
        var message = document.createElement('p');
        var label = document.createElement('small');
        function tick() {
          var text = slot ? (slot.item ? TransitAPI.presentation(slot.item, Date.now()).message : slot.message) : '';
          message.textContent = concise(text);
          label.textContent = text && message.textContent ? (slot.item && slot.item.kind === 'subway' ? slot.item.detail : slot.label) : '';
        }
        tick(); if (slot && slot.item) card.ticks.push(tick);
        cell.appendChild(message); cell.appendChild(label); row.appendChild(cell);
      });
      if (route.error) { var error = document.createElement('p'); error.className = 'error route-error'; error.textContent = route.error; row.appendChild(error); }
      card.arrivals.appendChild(row);
    });
  }
  function diagnostics() {
    var output = $('diagnostics');
    if (!output) return;
    output.textContent = cards.map(function (card) {
      return card.heading.textContent + '\n' + card.views.map(function (view) { return (view.target.route || view.target.value) + ' · 중계 왕복 ' + (view.latencyMs == null ? '-' : view.latencyMs) + 'ms'; }).join('\n') + '\n' + card.items.map(function (item) {
        return item.kind === 'subway' ? TransitAPI.diagnostic(item, Date.now()) : item.message + '\n' + item.secondMessage;
      }).join('\n\n');
    }).join('\n\n');
  }
  async function load(view, card, run, force) {
    if (run !== generation) return;
    var startedAt = Date.now();
    var controller = new AbortController(); controllers.push(controller);
    var timeout = setTimeout(function () { controller.abort(); }, 40000);
    try {
      var items = await client.load(view.target, Object.assign({}, settings, { forceRefresh: force }), controller.signal);
      if (run !== generation) return;
      view.items = items;
      if (view.target.type === 'bus' && view.items[0] && view.items[0].stop) card.heading.textContent = view.items[0].stop;
    } catch (error) {
      if (run !== generation) return;
      if (error.code === 'SERVICE_ENDED') view.items = [];
      view.error = error.code === 'SERVICE_ENDED' ? '' : error.message;
    } finally {
      clearTimeout(timeout);
      if (run === generation) { view.latencyMs = Date.now() - startedAt; view.pending = false; render(card); diagnostics(); }
    }
  }
  var cards = [], signature = '';
  setInterval(function () { cards.forEach(function (card) { card.ticks.forEach(function (tick) { tick(); }); }); }, 1000);
  async function refresh(force, automatic) {
    if (activeScreen !== 'transit') return;
    if (awaitingManual && force !== true) return;
    if (force === true) {
      autoCount = 0; awaitingManual = false;
      $('arrivalPanels').hidden = false; $('renewNotice').hidden = true; $('refreshBtn').textContent = '갱신';
      $('refreshHint').hidden = !cards.some(function (card) { return card.target.type === 'subway'; });
    }
    var refreshStartedAt = Date.now();
    clearTimeout(timer);
    controllers.forEach(function (controller) { controller.abort(); }); controllers = [];
    client.clear();
    var run = ++generation, targets;
    try { targets = TransitAPI.targets(settings); }
    catch (error) { $('saveStatus').textContent = error.message; $('refreshBtn').disabled = false; return; }
    var nextSignature = JSON.stringify(targets);
    if (signature !== nextSignature) {
      $('arrivalPanels').textContent = '';
      cards = TransitAPI.groupTargets(targets, true).map(makeCard); signature = nextSignature;
      $('refreshHint').hidden = !cards.some(function (card) { return card.target.type === 'subway'; });
    }
    var jobs = [];
    cards.forEach(function (card) {
      card.views.forEach(function (view) { view.pending = true; view.error = ''; jobs.push({ view: view, card: card }); });
      card.status.textContent = '(로딩중)'; card.status.hidden = false;
    });
    $('emptyState').hidden = targets.length > 0;
    $('refreshBtn').disabled = true;
    // 여러 곳을 조회해도 동시 API 요청은 3건으로 제한합니다.
    var cursor = 0;
    async function worker() {
      while (cursor < jobs.length && run === generation) {
        var index = cursor++;
        await load(jobs[index].view, jobs[index].card, run, force === true);
      }
    }
    await Promise.all([worker(), worker(), worker()]);
    if (run !== generation) return;
    $('refreshBtn').disabled = false;
    $('refreshStatus').textContent = targets.length ? targets.length + '곳 조회 · 자동 갱신 ' + settings.interval + '초' : '설정에서 조회할 역·정류소를 추가하세요.';
    if (automatic) autoCount++;
    if (autoCount >= 90) {
      awaitingManual = true; $('arrivalPanels').hidden = true; $('renewNotice').hidden = false;
      $('refreshHint').hidden = true; $('refreshBtn').textContent = '새로고침';
      return;
    }
    if (!document.hidden && targets.length) timer = setTimeout(function autoRefresh() { refresh(false, true); }, Math.max(0, settings.interval * 1000 - (Date.now() - refreshStartedAt)));
  }
  document.addEventListener('click', function (event) {
    var node = event.target && (event.target.closest ? event.target : event.target.parentElement);
    if (activeScreen !== 'transit') return;
    if (!node || node.closest('#screenSwitch, #settings, #settingsBtn, #newsPanel, a, input, textarea, select, label, summary')) return;
    if (!$('refreshBtn').disabled) refresh(true);
  });
  $('settingsForm').onsubmit = function (event) {
    event.preventDefault();
    var next = {};
    fields.forEach(function (key) { next[key] = String($(key).value).trim(); });
    next.relayToken = editingToken ? String($('relayToken').value).trim() : settings.relayToken;
    next.newsEnabled = $('newsEnabled').checked;
    next.refreshPolicy = '60s-90';
    next.textScale = applyTextScale(next.textScale);
    next.stops = draft.map(function (s) { return Object.assign({}, s); });
    next.interval = Math.min(3600, Math.max(30, Number(next.interval) || 60));
    try { TransitAPI.targets(next); TransitAPI.relayURL({ type: 'health' }, next); if (next.newsEnabled) TransitNews.source(next.newsUrl); }
    catch (error) { $('saveStatus').textContent = error.message; return; }
    settings = next;
    try { localStorage.setItem(storageKey, JSON.stringify(settings)); $('saveStatus').textContent = ''; }
    catch (_) { $('saveStatus').textContent = '저장할 수 없어 이번 화면에서만 사용합니다.'; }
    toggle(false); renderNews(); refresh(true);
  };
  $('presetBtn').onclick = function () {
    draft = TransitAPI.migrateStops({ station: '노들/9/공항방향', arsId: '20726/동작08,20014/360' }); renderEditor();
  };
  $('clearBtn').onclick = function () {
    settings = { relayUrl: defaultRelayUrl, relayToken: '', stops: [], interval: 60, textScale: 135, refreshPolicy: '60s-90', newsEnabled: false, newsUrl: TransitNews.defaultURL };
    fields.forEach(function (key) { $(key).value = settings[key]; });
    applyTextScale(settings.textScale); lockToken(); renderNews(); editStops();
    try { localStorage.removeItem(storageKey); $('saveStatus').textContent = ''; }
    catch (_) { $('saveStatus').textContent = '브라우저 설정에서 사이트 데이터를 삭제하세요.'; }
    refresh();
  };
  document.addEventListener('visibilitychange', function () { if (document.hidden) { clearTimeout(timer); } else { refresh(); } });
  function fitMenu() {
    var stage = $('menuStage'), board = $('menuBoard');
    if (activeScreen !== 'menu' || !stage || !stage.getBoundingClientRect) return;
    var height = Math.max(board.offsetHeight, board.scrollHeight + 2);
    if (!height) return;
    var available = Math.max(1, window.innerHeight - stage.getBoundingClientRect().top - 20);
    var scale = Math.min(1, stage.clientWidth / 860, available / height);
    board.style.transform = 'scale(' + scale + ')';
    board.style.left = Math.max(0, (stage.clientWidth - 860 * scale) / 2) + 'px';
    stage.style.height = height * scale + 'px';
  }
  function fitTrot() {
    var stage = $('trotStage'), board = $('trotBoard');
    if (activeScreen !== 'trot' || !stage || !stage.getBoundingClientRect) return;
    var landscape = window.innerWidth > window.innerHeight;
    var width = landscape ? 1800 : 1080, height = landscape ? 1000 : 1760;
    stage.setAttribute('data-layout', landscape ? 'landscape' : 'portrait');
    var available = Math.max(1, window.innerHeight - stage.getBoundingClientRect().top - 24);
    var scale = Math.min(stage.clientWidth / width, available / height);
    board.style.transform = 'scale(' + scale + ')';
    board.style.left = Math.max(0, (stage.clientWidth - width * scale) / 2) + 'px';
    stage.style.height = height * scale + 'px';
  }
  function fitMenuScreens() { fitMenu(); fitTrot(); }
  if (typeof window !== 'undefined') window.addEventListener('resize', fitMenuScreens);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitMenuScreens);
  function setScreen(screen, remember) {
    activeScreen = screen;
    $('transitHeader').hidden = screen !== 'transit'; $('transitScreen').hidden = screen !== 'transit'; $('menuScreen').hidden = screen !== 'menu'; $('trotScreen').hidden = screen !== 'trot';
    document.body.setAttribute('data-screen', screen);
    fitMenuScreens();
    $('transitScreenBtn').setAttribute('aria-pressed', String(screen === 'transit'));
    $('menuScreenBtn').setAttribute('aria-pressed', String(screen === 'menu'));
    $('trotScreenBtn').setAttribute('aria-pressed', String(screen === 'trot'));
    if (remember !== false) { try { localStorage.setItem(screenStorageKey, screen); } catch (_) {} }
    if (screen !== 'transit') {
      clearTimeout(timer); controllers.forEach(function (controller) { controller.abort(); }); controllers = []; generation++;
      $('refreshBtn').disabled = false;
      $('newsPlayer').textContent = ''; newsSignature = '';
      if (!$('settings').hidden) toggle(false);
    } else { renderNews(); refresh(remember !== false); }
  }
  $('transitScreenBtn').onclick = function () { if (activeScreen !== 'transit') setScreen('transit'); };
  $('menuScreenBtn').onclick = function () { if (activeScreen !== 'menu') setScreen('menu'); };
  $('trotScreenBtn').onclick = function () { if (activeScreen !== 'trot') setScreen('trot'); };
  setScreen(activeScreen, false);
})();
