function updateClock() { document.getElementById('clock').textContent = new Date().toLocaleTimeString('ko-KR'); }
updateClock(); setInterval(updateClock, 1000);

(function () {
  'use strict';
  var storageKey = 'seoul-transit-settings-v1';
  var fields = ['relayUrl', 'relayToken', 'station', 'arsId', 'interval'];
  var settings = { relayUrl: '', relayToken: '', station: '노들/9/공항방향',  arsId: '20726/동작08, 20014/360', interval: 180 };
  var timer, generation = 0, controllers = [];
  var client = TransitAPI.createClient();
  var $ = function (id) { return document.getElementById(id); };
  try {
    var saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (saved && typeof saved === 'object') fields.forEach(function (key) { if (typeof saved[key] === 'string' || typeof saved[key] === 'number') settings[key] = saved[key]; });
  } catch (_) { $('saveStatus').textContent = '저장 정보를 읽지 못했습니다. 다시 입력하세요.'; }
  settings.interval = Math.min(3600, Math.max(30, Number(settings.interval) || 180));
  fields.forEach(function (key) { $(key).value = settings[key]; });
  function toggle(open) {
    $('settings').hidden = !open;
    $('settingsBtn').setAttribute('aria-expanded', String(open));
    if (open) $('relayUrl').focus();
    else $('settingsBtn').focus();
  }
  $('settingsBtn').onclick = function () { toggle($('settings').hidden); };
  $('closeSettingsBtn').onclick = function () { toggle(false); };
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && !$('settings').hidden) toggle(false); });
  function makeCard(target) {
    var article = document.createElement('article');
    var heading = document.createElement('h2');
    heading.textContent = TransitAPI.label(target);
    var status = document.createElement('p'); status.className = 'meta'; status.setAttribute('role', 'status');
    var arrivals = document.createElement('div');
    article.appendChild(heading); article.appendChild(status); article.appendChild(arrivals);
    $('arrivalPanels').appendChild(article);
    return { heading: heading, status: status, arrivals: arrivals, ticks: [] };
  }
  function render(card, items) {
    card.arrivals.textContent = ''; card.ticks = [];
    items.forEach(function (item) {
      var row = document.createElement('div'); row.className = 'arrival';
      var title = document.createElement('strong'); title.textContent = item.title;
      var message = document.createElement('p'); message.title = 'API 원본: ' + item.message;
      var detail = document.createElement('small');
      var inspection, raw;
      if (item.kind === 'subway') {
        inspection = document.createElement('details'); inspection.className = 'inspection';
        var summary = document.createElement('summary'); summary.textContent = '원본 · 계산 확인';
        raw = document.createElement('pre');
        inspection.appendChild(summary); inspection.appendChild(raw);
      }
      function tick() {
        var display = TransitAPI.presentation(item, Date.now());
        message.textContent = display.message;
        if (raw) raw.textContent = TransitAPI.diagnostic(item, Date.now());
        detail.textContent = item.detail + (item.sourceTime ? ' · API 생성 ' + item.sourceTime : ' · API 생성 시각 미제공') + (display.note ? ' · ' + display.note : '');
      }
      tick(); if (item.kind === 'subway') card.ticks.push(tick);
      row.appendChild(title); row.appendChild(message); row.appendChild(detail);
      if (inspection) row.appendChild(inspection);
      card.arrivals.appendChild(row);
    });
  }
  async function load(target, card, run, force) {
    if (run !== generation) return;
    card.status.textContent = '조회 중…'; card.status.className = 'meta';
    var controller = new AbortController(); controllers.push(controller);
    var timeout = setTimeout(function () { controller.abort(); }, 40000);
    try {
      var items = await client.load(target, Object.assign({}, settings, { forceRefresh: force }), controller.signal);
      if (run !== generation) return;
      render(card, target.type === 'subway' ? items.slice(0, 2) : items);
      if (target.type === 'bus' && items[0] && items[0].stop) card.heading.textContent = '버스 · ' + items[0].stop + ' (' + target.value + ')' + (target.route ? ' · ' + target.route : '');
      card.status.textContent = (items.length ? '조회 ' : '조건 일치 정보 없음 · ') + new Date().toLocaleTimeString('ko-KR');
      if (force) card.status.textContent += items.relayInfo && items.relayInfo.cacheBypass ? ' · 원천 재조회 완료' : ' · 중계 업데이트 필요: 캐시 우회 미지원';
    } catch (error) {
      if (run !== generation) return;
      render(card, []);
      card.status.textContent = error.message; card.status.className = error.code === 'SERVICE_ENDED' ? 'meta' : 'error';
    } finally { clearTimeout(timeout); }
  }
  var cards = [], signature = '';
  setInterval(function () { cards.forEach(function (card) { card.ticks.forEach(function (tick) { tick(); }); }); }, 1000);
  async function refresh(force) {
    clearTimeout(timer);
    controllers.forEach(function (controller) { controller.abort(); }); controllers = [];
    client.clear();
    var run = ++generation, targets;
    try { targets = TransitAPI.targets(settings); }
    catch (error) { $('saveStatus').textContent = error.message; $('refreshBtn').disabled = false; return; }
    var nextSignature = JSON.stringify(targets);
    if (signature !== nextSignature) {
      $('arrivalPanels').textContent = '';
      cards = targets.map(makeCard); signature = nextSignature;
    }
    cards.forEach(function (card) { render(card, []); card.status.textContent = '조회 대기'; });
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
    try { localStorage.setItem(storageKey, JSON.stringify(settings)); $('saveStatus').textContent = '설정을 저장했습니다.'; }
    catch (_) { $('saveStatus').textContent = '저장할 수 없어 이번 화면에서만 사용합니다.'; }
    toggle(false); refresh();
  };
  $('presetBtn').onclick = function () {
    $('station').value = '노들/9/공항방향';
    $('arsId').value = '20726/동작08, 20014/360';
    $('saveStatus').textContent = '조회조건을 채웠습니다. 저장하고 닫기를 누르세요. 중계 설정은 유지됩니다.';
  };
  $('clearBtn').onclick = function () {
    settings = { relayUrl: '', relayToken: '', station: '',  arsId: '', interval: 180 };
    fields.forEach(function (key) { $(key).value = settings[key]; });
    try { localStorage.removeItem(storageKey); $('saveStatus').textContent = '저장 정보를 삭제했습니다.'; }
    catch (_) { $('saveStatus').textContent = '브라우저 설정에서 사이트 데이터를 삭제하세요.'; }
    refresh();
  };
  document.addEventListener('visibilitychange', function () { if (document.hidden) { clearTimeout(timer); } else { refresh(); } });
  refresh();
})();
