function updateClock() {
    const now = new Date();

    document.getElementById("clock").textContent =
        now.toLocaleTimeString("ko-KR");
}

updateClock();
setInterval(updateClock, 1000);


let count = 5;
let timer;
const btn = document.getElementById("testBtn");

function startTimer() {
    clearInterval(timer);

    count = 5;
    btn.textContent = count;

    timer = setInterval(function() {
        count = (count === 1) ? 5 : count - 1;
        btn.textContent = count;
    }, 1000);
}

btn.onclick = startTimer;
startTimer();

const memoUrl = 'https://script.googleusercontent.com/macros/echo?user_content_key=AUkAhnQmJ963RtFHCJx_mnCmMnBDn4asRvTmcAdAzpj6OenzE_CVOauvJGxhwa6DJey1H95XPAjBDiSil7P32Z9AWRSuKfaezjpunU4eriXzadQUeX9jL_pBbMpH33aw0aqo2X-FuPLT49OyFKjJW0AXeyus8cd6MOIKwY7CkgfpAYP_2hxPeJ6JwtbiO_uDxMlD4RT9YjD_H6Jsl3iBvGoFUMMAuJ3KgGp1IUx3YeUjPl-e2KxuIYKOOViedcKDgzIUZvOOAdAKd3YyQ9s62vU&lib=MQ0w-J6fltxPqWZkYIi0S-KVQSSnWPj7K';

async function loadMemo() {
  const response = await fetch(memoUrl);
  const data = await response.json();

  document.getElementById('memo').textContent = data.memo;
}

loadMemo().catch(function () { document.getElementById('memo').textContent = '메모를 불러오지 못했습니다.'; });

(function () {
  'use strict';
  var storageKey = 'seoul-transit-settings-v1';
  var fields = ['subwayKey', 'station', 'busKey', 'arsId', 'interval'];
  var settings = { subwayKey: '', station: '', busKey: '', arsId: '', interval: 60 };
  var timer, generation = 0, controllers = [];
  var $ = function (id) { return document.getElementById(id); };
  try {
    var saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (saved && typeof saved === 'object') fields.forEach(function (key) { if (typeof saved[key] === 'string' || typeof saved[key] === 'number') settings[key] = saved[key]; });
  } catch (_) { $('saveStatus').textContent = '저장 정보를 읽지 못했습니다. 다시 입력하세요.'; }
  settings.interval = Math.min(3600, Math.max(30, Number(settings.interval) || 60));
  fields.forEach(function (key) { $(key).value = settings[key]; });
  function toggle(open) {
    $('settings').hidden = !open;
    $('settingsBtn').setAttribute('aria-expanded', String(open));
  }
  $('settingsBtn').onclick = function () { toggle($('settings').hidden); };
  function render(type, items) {
    var target = $(type + 'Arrivals'); target.textContent = '';
    items.forEach(function (item) {
      var row = document.createElement('div'); row.className = 'arrival';
      [['strong', item.title], ['p', item.message], ['small', item.detail]].forEach(function (pair) {
        var node = document.createElement(pair[0]); node.textContent = pair[1]; row.appendChild(node);
      });
      target.appendChild(row);
    });
  }
  async function load(type, run) {
    var status = $(type + 'Status');
    var key = type === 'subway' ? settings.subwayKey : settings.busKey;
    if (!key) { render(type, []); status.textContent = '설정에서 인증키를 입력하세요.'; status.className = 'meta'; return; }
    status.textContent = '조회 중…'; status.className = 'meta';
    var controller = new AbortController(); controllers.push(controller);
    var timeout = setTimeout(function () { controller.abort(); }, 12000);
    try {
      var url = TransitAPI.buildURL(type, settings);
      var response;
      try { response = await fetch(url, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' }); }
      catch (_) { throw new Error('직접 연결 실패: HTTPS·CORS 차단, 네트워크 또는 응답 지연일 수 있습니다. 키 노출 허용만으로 브라우저 차단이 해제되지는 않습니다.'); }
      if (!response.ok) throw new Error('API HTTP 오류 (' + response.status + '). 잠시 후 다시 시도하세요.');
      var data;
      try { data = await response.json(); } catch (_) { throw new Error('JSON 응답을 받지 못했습니다. 키 승인과 API 제공기관 상태를 확인하세요.'); }
      var items = TransitAPI.normalize(type, data);
      if (run !== generation) return;
      render(type, items);
      if (type === 'bus' && items[0] && items[0].stop) $('busTitle').textContent = '버스 · ' + items[0].stop;
      status.textContent = (items.length ? '갱신 ' : '현재 도착정보 없음 · ') + new Date().toLocaleTimeString('ko-KR');
    } catch (error) {
      if (run !== generation) return;
      render(type, []); // 오래된 정보를 현재 도착정보처럼 보여주지 않습니다.
      status.textContent = error.message; status.className = 'error';
    } finally { clearTimeout(timeout); }
  }
  async function refresh() {
    clearTimeout(timer);
    controllers.forEach(function (controller) { controller.abort(); }); controllers = [];
    var run = ++generation;
    $('subwayTitle').textContent = '지하철' + (settings.station ? ' · ' + settings.station : '');
    $('busTitle').textContent = '버스' + (settings.arsId ? ' · ' + settings.arsId : '');
    $('refreshBtn').disabled = true;
    await Promise.all([load('subway', run), load('bus', run)]);
    if (run !== generation) return;
    $('refreshBtn').disabled = false;
    $('refreshStatus').textContent = '자동 갱신 ' + settings.interval + '초 · API 직접 조회';
    if (!document.hidden) timer = setTimeout(refresh, settings.interval * 1000);
  }
  $('refreshBtn').onclick = refresh;
  $('settingsForm').onsubmit = function (event) {
    event.preventDefault();
    fields.forEach(function (key) { settings[key] = $(key).value.trim(); });
    settings.interval = Math.min(3600, Math.max(30, Number(settings.interval) || 60));
    try { localStorage.setItem(storageKey, JSON.stringify(settings)); $('saveStatus').textContent = '이 브라우저에 저장했습니다.'; }
    catch (_) { $('saveStatus').textContent = '저장할 수 없어 이번 화면에서만 사용합니다.'; }
    refresh();
  };
  $('clearBtn').onclick = function () {
    settings = { subwayKey: '', station: '', busKey: '', arsId: '', interval: 60 };
    fields.forEach(function (key) { $(key).value = settings[key]; });
    try { localStorage.removeItem(storageKey); $('saveStatus').textContent = '저장 정보를 삭제했습니다.'; }
    catch (_) { $('saveStatus').textContent = '브라우저 저장소에 접근할 수 없습니다. 브라우저 설정에서 사이트 데이터를 삭제하세요.'; }
    refresh();
  };
  document.addEventListener('visibilitychange', function () { if (document.hidden) { clearTimeout(timer); } else { refresh(); } });
  if (!settings.subwayKey && !settings.busKey) toggle(true);
  refresh();
})();
