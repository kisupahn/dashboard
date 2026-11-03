(function (root) {
  'use strict';
  function error(message, code) { var e = new Error(message); e.code = code; return e; }
  function targets(settings) {
    var result = [];
    ['subway', 'bus'].forEach(function (type) {
      var text = type === 'subway' ? settings.station : settings.arsId;
      var seen = [];
      String(text || '').split(/[,，\n]/).map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (text) {
        var p = text.split('/').map(function (s) { return s.trim(); });
        var t = { type: type, value: p[0] };
        if (type === 'bus') {
          if (!/^\d{5}$/.test(p[0]) || !p[1] || p.length > 2) throw error('버스는 정류소/노선으로 입력하세요. 예: 20014/360');
          t.route = p[1];
          t.routeId = /^\d{9}$/.test(p[1]) ? p[1] : root.SeoulRoutes[p[1]];
          if (!t.routeId) throw error('노선 ID를 찾지 못했습니다. 노선명을 확인하거나 9자리 노선 ID를 입력하세요.');
        } else {
          if (!p[0] || p[0].length > 50 || p.length > 3) throw error('지하철은 역명/호선/방향으로 입력하세요.');
          if (p[1]) {
            var line = p[1].replace(/호선$/, '');
            if (!/^[1-9]$/.test(line)) throw error('호선은 1~9로 입력하세요.');
            t.line = String(1000 + Number(line));
          }
          if (p[2] === '공항방향' && p[0] === '노들' && t.line === '1009') {
            t.via = '노량진'; t.directionLabel = '김포공항 방면';
          } else if (p[2]) {
            if (['상행', '하행', '내선', '외선'].indexOf(p[2]) < 0) throw error('노들/9/공항방향 또는 API 방향(상행·하행·내선·외선)을 입력하세요.');
            t.direction = p[2];
          }
        }
        var id = JSON.stringify(t);
        if (seen.indexOf(id) >= 0) return;
        seen.push(id);
        if (seen.length > 10) throw error('서비스별 최대 10개 조건을 지원합니다.');
        result.push(t);
      });
    });
    return result;
  }
  function label(t) {
    return (t.type === 'subway' ? '지하철 · ' : '버스 · ') + t.value + (t.route ? ' · ' + t.route : '') + (t.line ? ' · ' + (Number(t.line) - 1000) + '호선' : '') + (t.directionLabel || t.direction ? ' · ' + (t.directionLabel || t.direction) : '');
  }
  function normalize(type, data) {
    if (!data || typeof data !== 'object') throw error('API 응답 형식이 올바르지 않습니다.');
    if (type === 'subway') {
      var code = (data.errorMessage || {}).code || (data.RESULT || {}).CODE || data.code;
      if (code === 'INFO-200') return [];
      if (code && code !== 'INFO-000') throw error('지하철 API 오류. 키의 유효성·호출 한도·역명을 확인하세요.', 'PROVIDER');
      if (!Array.isArray(data.realtimeArrivalList)) throw error('지하철 응답 형식이 올바르지 않습니다.');
      return data.realtimeArrivalList.map(function (v) {
        var lineName = String(v.trainLineNm || '');
        var match = lineName.match(/-\s*(.*?)\s*방면\s*$/);
        return { title: lineName || String(v.bstatnNm || '지하철'), message: String(v.arvlMsg2 || '안내 없음'), detail: String(v.arvlMsg3 || ''), line: String(v.subwayId || ''), station: String(v.statnNm || ''), direction: String(v.updnLine || ''), via: match ? match[1].trim() : '', sourceTime: String(v.recptnDt || ''), order: String(v.ordkey || '') };
      });
    }
    var code = String((data.msgHeader || {}).headerCd);
    var messages = { '1': '제공기관 시스템 오류', '2': '요청 변수 오류', '3': '정류소를 찾을 수 없음', '4': '노선을 찾을 수 없음', '5': '위치 요청 오류', '6': '실시간정보 읽기 실패', '7': '경로 검색 결과 없음', '8': '운행 종료' };
    if (code !== '0') throw error('버스: ' + (messages[code] || '인증·활용 승인 또는 제공기관 응답 오류'), code === '8' ? 'SERVICE_ENDED' : 'PROVIDER');
    if (!data.msgBody || !Object.prototype.hasOwnProperty.call(data.msgBody, 'itemList')) throw error('버스 응답 형식이 올바르지 않습니다.');
    var rows = data.msgBody.itemList || [];
    if (!Array.isArray(rows)) rows = [rows];
    return rows.map(function (v) { return { title: String(v.busRouteAbrv || v.rtNm || '버스'), message: String(v.arrmsg1 || '안내 없음'), detail: '다음 차량 · ' + String(v.arrmsg2 || '안내 없음'), stop: String(v.stNm || ''), arsId: String(v.arsId || '').padStart(5, '0'), routeId: String(v.busRouteId || ''), sourceTime: String(v.mkTm || '') }; });
  }
  function filter(type, items, target) {
    if (type === 'subway') {
      var candidates = items.filter(function (v) { return v.station === target.value && (!target.line || v.line === target.line); });
      if (target.via && candidates.length && candidates.some(function (v) { return !v.via; })) throw error('방면 정보 확인 불가. 실제 trainLineNm 응답 확인이 필요합니다.', 'DIRECTION_UNKNOWN');
      return candidates.filter(function (v) { return (!target.via || v.via === target.via) && (!target.direction || v.direction === target.direction); }).sort(function (a, b) { return a.order.localeCompare(b.order); });
    }
    return items.filter(function (v) { return v.arsId === target.value && v.routeId === target.routeId; });
  }
  function relayURL(target, connection) {
    if (!connection || !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(connection.relayUrl || '')) throw error('설정에 Apps Script 웹 앱 주소(/exec)를 입력하세요.', 'CONFIG');
    if (!connection.relayToken || connection.relayToken.length < 16) throw error('중계 접속 코드(16자 이상)를 입력하세요.', 'CONFIG');
    var url = new URL(connection.relayUrl);
    url.searchParams.set('type', target.type);
    url.searchParams.set('token', connection.relayToken);
    if (target.type === 'subway') url.searchParams.set('station', target.value);
    else if (target.type === 'bus') url.searchParams.set('routeId', target.routeId);
    return url.href;
  }
  var serial = 0;
  function jsonp(url, signal) {
    return new Promise(function (resolve, reject) {
      if (signal && signal.aborted) { reject(error('조회가 취소되었습니다.', 'ABORT')); return; }
      var callback = '__seoulRelay_' + Date.now() + '_' + (++serial);
      var script = root.document.createElement('script');
      var timer, settled = false;
      function finish(err, data) {
        if (settled) return; settled = true;
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', abort);
        script.remove();
        // 취소 후 늦게 도착한 스크립트도 전역 오류를 만들지 않습니다.
        root[callback] = function () {};
        setTimeout(function () { delete root[callback]; }, 60000);
        if (err) reject(err); else resolve({ ok: true, json: async function () { return data; } });
      }
      function abort() { finish(error('조회가 취소되었습니다.', 'ABORT')); }
      root[callback] = function (data) { finish(null, data); };
      script.onerror = function () { finish(error('중계 연결 실패. 웹 앱을 모든 사용자에게 배포했는지 확인하세요.', 'NETWORK')); };
      var parsed = new URL(url); parsed.searchParams.set('callback', callback);
      script.src = parsed.href; script.referrerPolicy = 'no-referrer';
      timer = setTimeout(function () { finish(error('중계 응답 지연. 배포 주소와 접근 권한을 확인하세요.', 'TIMEOUT')); }, 35000);
      if (signal) signal.addEventListener('abort', abort, { once: true });
      root.document.head.appendChild(script);
    });
  }
  function createClient(fetchImpl) {
    fetchImpl = fetchImpl || function (url, options) { return jsonp(url, options.signal); };
    var cache = new Map();
    return {
      async load(target, key, signal) {
        var type = target.type;
        var url = relayURL(target, key);
        var hit = cache.get(url);
        if (hit && Date.now() - hit.time < 15000) return filter(type, hit.rows, target);
        if (hit && hit.pending) return filter(type, await hit.pending, target);
        var task = (async function () {
          var res;
          try { res = await fetchImpl(url, { signal: signal, credentials: 'omit', referrerPolicy: 'no-referrer' }); }
          catch (e) { if (e.code) throw e; throw error('중계 연결 실패. 배포 주소와 접근 권한을 확인하세요.', 'NETWORK'); }
          if (!res.ok) throw error('제공기관 HTTP 오류 (' + res.status + ')', 'HTTP');
          var data;
          try { data = await res.json(); } catch (_) { throw error('JSON 응답이 아닙니다. 키 승인과 제공기관 상태를 확인하세요.', 'FORMAT'); }
          {
            if (!data || !data.ok) throw error(data && data.error ? data.error.message : '중계 응답 오류', data && data.error ? data.error.code : 'FORMAT');
            data = data.data;
          }
          return normalize(type, data);
        })();
        var entry = { pending: task };
        cache.set(url, entry);
        try {
          var rows = await task;
          if (cache.size > 100) cache.delete(cache.keys().next().value);
          if (cache.get(url) === entry) cache.set(url, { rows: rows, time: Date.now() });
          return filter(type, rows, target);
        } catch (e) { if (cache.get(url) === entry) cache.delete(url); throw e; }
      },
      clear: function () { cache.clear(); }
    };
  }
  root.TransitAPI = { targets: targets, label: label, normalize: normalize, filter: filter, createClient: createClient, relayURL: relayURL, jsonp: jsonp };
})(typeof window !== 'undefined' ? window : globalThis);
