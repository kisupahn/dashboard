function updateClock() { document.getElementById('clock').textContent = new Date().toLocaleTimeString('ko-KR'); }
updateClock(); setInterval(updateClock, 1000);

(function () {
  'use strict';
  var defaultRelayUrl = 'https://script.google.com/macros/s/AKfycbwBtccv4cEjgbfxSxXCHvtbYnOI7QNQcjB1AT_PGDfqDCWtB7f7vXVeFb13JLKDF9n4hA/exec';
  var storageKey = 'seoul-transit-settings-v1';
  var fields = ['relayUrl', 'relayToken', 'station', 'arsId', 'interval'];
  var settings = { relayUrl: defaultRelayUrl, relayToken: '', station: '노들/9/공항방향',  arsId: '20726/동작08, 20014/360', interval: 180 };
  var timer, generation = 0, controllers = [];
  var client = TransitAPI.createClient();
  var $ = function (id) { return document.getElementById(id); };
  try {
    var saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (saved && typeof saved === 'object') fields.forEach(function (key) { if (typeof saved[key] === 'string' || typeof saved[key] === 'number') settings[key] = saved[key]; });
  } catch (_) { $('saveStatus').textContent = '저장 정보를 읽지 못했습니다. 다시 입력하세요.'; }
  if (!settings.relayUrl) settings.relayUrl = defaultRelayUrl;
  settings.interval = Math.min(3600, Math.max(30, Number(settings.interval) || 180));
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
  function makeCard(target) {
    var article = document.createElement('article');
    var heading = document.createElement('h2'); heading.textContent = TransitAPI.label(target);
    var status = document.createElement('p'); status.className = 'error'; status.setAttribute('role', 'status'); status.hidden = true;
    var arrivals = document.createElement('div'); arrivals.className = 'arrivals';
    article.appendChild(heading); article.appendChild(status); article.appendChild(arrivals);
    $('arrivalPanels').appendChild(article);
    var card = { target: target, heading: heading, status: status, arrivals: arrivals, ticks: [], items: [] };
    render(card, []);
    return card;
  }
  function concise(message) {
    return message.replace(/^약\s*/, '').replace(/\s*후(?:\s*\([^)]*\))?$/, '').replace('예정 시각 경과 · 새 정보 대기', '');
  }
  function render(card, items) {
    card.arrivals.textContent = ''; card.ticks = []; card.items = items;
    TransitAPI.arrivalSlots(card.target.type, items).forEach(function (slot) {
      var row = document.createElement('div'); row.className = 'arrival';
      var message = document.createElement('p');
      var label = document.createElement('small');
      function tick() {
        var text = slot ? (slot.item ? TransitAPI.presentation(slot.item, Date.now()).message : slot.message) : '';
        message.textContent = concise(text);
        label.textContent = text && message.textContent ? slot.label : '';
      }
      tick(); if (slot && slot.item) card.ticks.push(tick);
      row.appendChild(message); row.appendChild(label); card.arrivals.appendChild(row);
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
  async function load(target, card, run, force) {
    if (run !== generation) return;
    card.status.hidden = true; card.status.textContent = '';
    var controller = new AbortController(); controllers.push(controller);
    var timeout = setTimeout(function () { controller.abort(); }, 40000);
    try {
      var items = await client.load(target, Object.assign({}, settings, { forceRefresh: force }), controller.signal);
      if (run !== generation) return;
      render(card, items);
      if (target.type === 'bus' && items[0] && items[0].stop) card.heading.textContent = items[0].stop;
      diagnostics();
    } catch (error) {
      if (run !== generation) return;
      render(card, []);
      card.status.textContent = error.code === 'SERVICE_ENDED' ? '' : error.message; card.status.hidden = error.code === 'SERVICE_ENDED'; card.status.className = 'error';
    } finally { clearTimeout(timeout); }
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
      cards = targets.map(makeCard); signature = nextSignature;
    }
    cards.forEach(function (card) { render(card, []); card.status.hidden = true; });
    $('emptyState').hidden = targets.length > 0;
    $('refreshBtn').disabled = true;
    // 여러 곳을 조회해도 동시 API 요청은 3건으로 제한합니다.
    var cursor = 0;
    async function worker() {
      while (cursor < targets.length && run === generation) {
        var index = cursor++;
        await load(targets[index], cards[index], run, force === true);
      }
    }
    await Promise.all([worker(), worker(), worker()]);
    if (run !== generation) return;
    $('refreshBtn').disabled = false;
    $('refreshStatus').textContent = targets.length ? targets.length + '곳 조회 · 자동 갱신 ' + settings.interval + '초' : '설정에서 조회할 역·정류소를 추가하세요.';
    if (!document.hidden && targets.length) timer = setTimeout(refresh, settings.interval * 1000);
  }
  $('refreshBtn').onclick = function () { refresh(true); };
  $('settingsForm').onsubmit = function (event) {
    event.preventDefault();
    var next = {};
    fields.forEach(function (key) { next[key] = String($(key).value).trim(); });
    next.interval = Math.min(3600, Math.max(30, Number(next.interval) || 180));
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
    settings = { relayUrl: defaultRelayUrl, relayToken: '', station: '',  arsId: '', interval: 180 };
    fields.forEach(function (key) { $(key).value = settings[key]; });
    try { localStorage.removeItem(storageKey); $('saveStatus').textContent = ''; }
    catch (_) { $('saveStatus').textContent = '브라우저 설정에서 사이트 데이터를 삭제하세요.'; }
    refresh();
  };
  document.addEventListener('visibilitychange', function () { if (document.hidden) { clearTimeout(timer); } else { refresh(); } });
  refresh();
})();
