function updateClock() { document.getElementById('clock').textContent = new Date().toLocaleTimeString('ko-KR'); }
updateClock(); setInterval(updateClock, 1000);

(function () {
  'use strict';
  var storageKey = 'seoul-transit-settings-v1';
  var fields = ['subwayKey', 'station', 'busKey', 'arsId', 'interval'];
  var settings = { subwayKey: '', station: '노들/9/공항방향', busKey: '', arsId: '20276/동작08, 20014/360', interval: 180 };
  var timer, generation = 0, controllers = [];
  var client = TransitAPI.createClient();
  var $ = function (id) { return document.getElementById(id); };
  try {
    var saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (saved && typeof saved === 'object') fields.forEach(function (key) { if (typeof saved[key] === 'string' || typeof saved[key] === 'number') settings[key] = saved[key]; });
  } catch (_) { $('saveStatus').textContent = '저장 정보를 읽지 못했습니다. 다시 입력하세요.'; }
  settings.interval = Math.min(3600, Math.max(180, Number(settings.interval) || 180));
  fields.forEach(function (key) { $(key).value = settings[key]; });
  function toggle(open) {
    $('settings').hidden = !open;
    $('settingsBtn').setAttribute('aria-expanded', String(open));
    if (open) $('subwayKey').focus();
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
    return { heading: heading, status: status, arrivals: arrivals };
  }
  function render(card, items) {
    card.arrivals.textContent = '';
    items.forEach(function (item) {
      var row = document.createElement('div'); row.className = 'arrival';
      [['strong', item.title], ['p', item.message], ['small', item.detail + (item.sourceTime ? ' · API 생성 ' + item.sourceTime : ' · API 생성 시각 미제공')]].forEach(function (pair) {
        var node = document.createElement(pair[0]); node.textContent = pair[1]; row.appendChild(node);
      });
      card.arrivals.appendChild(row);
    });
  }
  async function load(target, card, run) {
    if (run !== generation) return;
    card.status.textContent = '조회 중…'; card.status.className = 'meta';
    var controller = new AbortController(); controllers.push(controller);
    var timeout = setTimeout(function () { controller.abort(); }, 12000);
    try {
      var key = target.type === 'subway' ? settings.subwayKey : settings.busKey;
      if (!key) throw new Error((target.type === 'subway' ? '지하철' : '버스') + ' 인증키를 설정하세요.');
      var items = await client.load(target, key, controller.signal);
      if (run !== generation) return;
      render(card, target.type === 'subway' ? items.slice(0, 2) : items);
      if (target.type === 'bus' && items[0] && items[0].stop) card.heading.textContent = '버스 · ' + items[0].stop + ' (' + target.value + ')' + (target.route ? ' · ' + target.route : '');
      card.status.textContent = (items.length ? '갱신 ' : '조건 일치 정보 없음 · ') + new Date().toLocaleTimeString('ko-KR');
    } catch (error) {
      if (run !== generation) return;
      render(card, []);
      card.status.textContent = error.message; card.status.className = error.code === 'SERVICE_ENDED' ? 'meta' : 'error';
    } finally { clearTimeout(timeout); }
  }
  var cards = [], signature = '';
  async function refresh() {
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
        await load(targets[index], cards[index], run);
      }
    }
    await Promise.all([worker(), worker(), worker()]);
    if (run !== generation) return;
    $('refreshBtn').disabled = false;
    $('refreshStatus').textContent = targets.length ? targets.length + '곳 조회 · 자동 갱신 ' + settings.interval + '초' : '설정에서 조회할 역·정류소를 추가하세요.';
    if (!document.hidden && targets.length) timer = setTimeout(refresh, settings.interval * 1000);
  }
  $('refreshBtn').onclick = refresh;
  $('settingsForm').onsubmit = function (event) {
    event.preventDefault();
    var next = {};
    fields.forEach(function (key) { next[key] = String($(key).value).trim(); });
    next.interval = Math.min(3600, Math.max(180, Number(next.interval) || 180));
    try { TransitAPI.targets(next); }
    catch (error) { $('saveStatus').textContent = error.message; return; }
    settings = next;
    try { localStorage.setItem(storageKey, JSON.stringify(settings)); $('saveStatus').textContent = '설정을 저장했습니다.'; }
    catch (_) { $('saveStatus').textContent = '저장할 수 없어 이번 화면에서만 사용합니다.'; }
    toggle(false); refresh();
  };
  $('presetBtn').onclick = function () {
    $('station').value = '노들/9/공항방향';
    $('arsId').value = '20276/동작08, 20014/360';
    $('saveStatus').textContent = '조회조건을 채웠습니다. 저장하고 닫기를 누르세요. 인증키는 유지됩니다.';
  };
  $('clearBtn').onclick = function () {
    settings = { subwayKey: '', station: '', busKey: '', arsId: '', interval: 180 };
    fields.forEach(function (key) { $(key).value = settings[key]; });
    try { localStorage.removeItem(storageKey); $('saveStatus').textContent = '저장 정보를 삭제했습니다.'; }
    catch (_) { $('saveStatus').textContent = '브라우저 설정에서 사이트 데이터를 삭제하세요.'; }
    refresh();
  };
  document.addEventListener('visibilitychange', function () { if (document.hidden) { clearTimeout(timer); } else { refresh(); } });
  refresh();
})();
