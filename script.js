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
  var fields = ['relayUrl', 'relayToken', 'interval'];
  var settings = { relayUrl: defaultRelayUrl, relayToken: '', station: '노들/9/공항방향',  arsId: '20726/동작08, 20014/360', interval: 30 };
  var timer, generation = 0, controllers = [], autoCount = 0, awaitingManual = false;
  var client = TransitAPI.createClient();
  var $ = function (id) { return document.getElementById(id); };
  try {
    var saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (saved && typeof saved === 'object') {
      ['relayUrl', 'relayToken', 'interval', 'station', 'arsId'].forEach(function (key) { if (typeof saved[key] === 'string' || typeof saved[key] === 'number') settings[key] = saved[key]; });
      if (Array.isArray(saved.stops)) settings.stops = saved.stops;
    }
  } catch (_) { $('saveStatus').textContent = '저장 정보를 읽지 못했습니다. 다시 입력하세요.'; }
  if (!settings.relayUrl) settings.relayUrl = defaultRelayUrl;
  settings.interval = Math.min(3600, Math.max(30, Number(settings.interval) || 30));
  fields.forEach(function (key) { $(key).value = settings[key]; });
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
      var types = document.createElement('div'); types.className = 'type-toggle';
      ['bus', 'subway'].forEach(function (type) {
        var choice = button(type === 'bus' ? '버스' : '지하철', function () { if (stop.type !== type) { stop.type = type; stop.location = ''; stop.condition = ''; renderEditor(); } });
        choice.setAttribute('aria-pressed', String(type === stop.type)); types.appendChild(choice);
      }); box.appendChild(types);
      function field(title, key, placeholder) {
        var label = document.createElement('label'); label.textContent = title;
        var input = document.createElement('input'); input.value = stop[key]; input.placeholder = placeholder; input.required = true;
        input.oninput = function () { stop[key] = input.value; }; label.appendChild(input); box.appendChild(label);
      }
      field('정류장명 또는 코드', 'location', stop.type === 'bus' ? '20726 또는 신동아정문' : '노들');
      field('노선 및 방향', 'condition', stop.type === 'bus' ? '동작08 (여러 노선은 쉼표로 구분)' : '9호선 공항방향');
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
    if (open) { editStops(); $('relayToken').focus(); }
    else $('settingsBtn').focus();
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
    if (awaitingManual && force !== true) return;
    if (force === true) {
      autoCount = 0; awaitingManual = false;
      $('arrivalPanels').hidden = false; $('renewNotice').hidden = true; $('refreshBtn').textContent = '갱신';
      $('refreshHint').hidden = !cards.some(function (card) { return card.target.type === 'subway'; });
    }
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
    if (autoCount >= 30) {
      awaitingManual = true; $('arrivalPanels').hidden = true; $('renewNotice').hidden = false;
      $('refreshHint').hidden = true; $('refreshBtn').textContent = '새로고침';
      return;
    }
    if (!document.hidden && targets.length) timer = setTimeout(function autoRefresh() { refresh(false, true); }, settings.interval * 1000);
  }
  document.addEventListener('click', function (event) {
    var node = event.target && (event.target.closest ? event.target : event.target.parentElement);
    if (!node || node.closest('#settings, #settingsBtn, a, input, textarea, select, label, summary')) return;
    if (!$('refreshBtn').disabled) refresh(true);
  });
  $('settingsForm').onsubmit = function (event) {
    event.preventDefault();
    var next = {};
    fields.forEach(function (key) { next[key] = String($(key).value).trim(); });
    next.stops = draft.map(function (s) { return Object.assign({}, s); });
    next.interval = Math.min(3600, Math.max(30, Number(next.interval) || 30));
    try { TransitAPI.targets(next); TransitAPI.relayURL({ type: 'health' }, next); }
    catch (error) { $('saveStatus').textContent = error.message; return; }
    settings = next;
    try { localStorage.setItem(storageKey, JSON.stringify(settings)); $('saveStatus').textContent = ''; }
    catch (_) { $('saveStatus').textContent = '저장할 수 없어 이번 화면에서만 사용합니다.'; }
    toggle(false); refresh(true);
  };
  $('presetBtn').onclick = function () {
    draft = TransitAPI.migrateStops({ station: '노들/9/공항방향', arsId: '20726/동작08,20014/360' }); renderEditor();
  };
  $('clearBtn').onclick = function () {
    settings = { relayUrl: defaultRelayUrl, relayToken: '', stops: [], interval: 30 };
    fields.forEach(function (key) { $(key).value = settings[key]; });
    editStops();
    try { localStorage.removeItem(storageKey); $('saveStatus').textContent = ''; }
    catch (_) { $('saveStatus').textContent = '브라우저 설정에서 사이트 데이터를 삭제하세요.'; }
    refresh();
  };
  document.addEventListener('visibilitychange', function () { if (document.hidden) { clearTimeout(timer); } else { refresh(); } });
  refresh();
})();
