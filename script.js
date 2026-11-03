function updateClock() { document.getElementById('clock').textContent = new Date().toLocaleTimeString('ko-KR'); }
updateClock(); setInterval(updateClock, 1000);

(function () {
  'use strict';
  var defaultRelayUrl = 'https://script.google.com/macros/s/AKfycbwBtccv4cEjgbfxSxXCHvtbYnOI7QNQcjB1AT_PGDfqDCWtB7f7vXVeFb13JLKDF9n4hA/exec';
  var storageKey = 'seoul-transit-settings-v1';
  var fields = ['relayUrl', 'relayToken', 'station', 'arsId', 'interval'];
  var settings = { relayUrl: defaultRelayUrl, relayToken: '', station: '노들/9/공항방향',  arsId: '20726/동작08, 20014/360', interval: 30 };
  var timer, generation = 0, controllers = [];
  var client = TransitAPI.createClient();
  var $ = function (id) { return document.getElementById(id); };
  try {
    var saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (saved && typeof saved === 'object') fields.forEach(function (key) { if (typeof saved[key] === 'string' || typeof saved[key] === 'number') settings[key] = saved[key]; });
  } catch (_) { $('saveStatus').textContent = '저장 정보를 읽지 못했습니다. 다시 입력하세요.'; }
  if (!settings.relayUrl) settings.relayUrl = defaultRelayUrl;
  settings.interval = Math.min(3600, Math.max(30, Number(settings.interval) || 30));
  fields.forEach(function (key) { $(key).value = settings[key]; });
  function toggle(open) {
    $('settings').hidden = !open;
    $('settingsBtn').setAttribute('aria-expanded', String(open));
    if (open) $('relayToken').focus();
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
      return card.heading.textContent + '\n' + card.items.map(function (item) {
        return item.kind === 'subway' ? TransitAPI.diagnostic(item, Date.now()) : item.message + '\n' + item.secondMessage;
      }).join('\n\n');
    }).join('\n\n');
  }
  async function load(view, card, run, force) {
    if (run !== generation) return;
    var controller = new AbortController(); controllers.push(controller);
    var timeout = setTimeout(function () { controller.abort(); }, 40000);
    try {
      var items = await client.load(view.target, Object.assign({}, settings, { forceRefresh: force }), controller.signal);
      if (run !== generation) return;
      view.items = items;
      if (view.target.type === 'bus' && view.items[0] && view.items[0].stop) card.heading.textContent = view.items[0].stop;
    } catch (error) {
      if (run !== generation) return;
      view.items = []; view.error = error.code === 'SERVICE_ENDED' ? '' : error.message;
    } finally {
      clearTimeout(timeout);
      if (run === generation) { view.pending = false; render(card); diagnostics(); }
    }
  }
  var cards = [], signature = '';
  setInterval(function () { cards.forEach(function (card) { card.ticks.forEach(function (tick) { tick(); }); }); }, 1000);
  async function refresh(force) {
    clearTimeout(timer);
    controllers.forEach(function (controller) { controller.abort(); }); controllers = [];
    client.clear();
    var run = ++generation, targets;
    try { targets = TransitAPI.targets(settings).sort(function (a, b) { return (a.type === 'bus' ? 0 : 1) - (b.type === 'bus' ? 0 : 1); }); }
    catch (error) { $('saveStatus').textContent = error.message; $('refreshBtn').disabled = false; return; }
    var nextSignature = JSON.stringify(targets);
    if (signature !== nextSignature) {
      $('arrivalPanels').textContent = '';
      cards = TransitAPI.groupTargets(targets).map(makeCard); signature = nextSignature;
      $('refreshHint').hidden = !cards.some(function (card) { return card.target.type === 'subway'; });
    }
    var jobs = [];
    cards.forEach(function (card) {
      card.views.forEach(function (view) { view.items = []; view.pending = true; view.error = ''; jobs.push({ view: view, card: card }); });
      card.status.textContent = '(로딩중)'; render(card);
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
    if (!document.hidden && targets.length) timer = setTimeout(refresh, settings.interval * 1000);
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
    next.interval = Math.min(3600, Math.max(30, Number(next.interval) || 30));
    try { TransitAPI.targets(next); TransitAPI.relayURL({ type: 'health' }, next); }
    catch (error) { $('saveStatus').textContent = error.message; return; }
    settings = next;
    try { localStorage.setItem(storageKey, JSON.stringify(settings)); $('saveStatus').textContent = ''; }
    catch (_) { $('saveStatus').textContent = '저장할 수 없어 이번 화면에서만 사용합니다.'; }
    toggle(false); refresh();
  };
  $('presetBtn').onclick = function () {
    $('station').value = '노들/9/공항방향';
    $('arsId').value = '20726/동작08, 20014/360';
    $('saveStatus').textContent = '';
  };
  $('clearBtn').onclick = function () {
    settings = { relayUrl: defaultRelayUrl, relayToken: '', station: '',  arsId: '', interval: 30 };
    fields.forEach(function (key) { $(key).value = settings[key]; });
    try { localStorage.removeItem(storageKey); $('saveStatus').textContent = ''; }
    catch (_) { $('saveStatus').textContent = '브라우저 설정에서 사이트 데이터를 삭제하세요.'; }
    refresh();
  };
  document.addEventListener('visibilitychange', function () { if (document.hidden) { clearTimeout(timer); } else { refresh(); } });
  refresh();
})();
