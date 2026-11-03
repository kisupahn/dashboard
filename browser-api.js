(function (root) {
  'use strict';
  function buildURL(type, settings) {
    if (type === 'subway') {
      if (!settings.subwayKey || !settings.station.trim()) throw new Error('지하철 키와 역명을 설정하세요.');
      return 'https://swopenapi.seoul.go.kr/api/subway/' + encodeURIComponent(settings.subwayKey.trim()) + '/json/realtimeStationArrival/0/100/' + encodeURIComponent(settings.station.trim());
    }
    if (!settings.busKey || !/^\d{5}$/.test(settings.arsId)) throw new Error('버스 키와 5자리 정류소 번호를 설정하세요.');
    var url = new URL('https://ws.bus.go.kr/api/rest/stationinfo/getStationByUid');
    url.searchParams.set('serviceKey', settings.busKey.trim());
    url.searchParams.set('arsId', settings.arsId);
    url.searchParams.set('resultType', 'json');
    return url.href;
  }
  function normalize(type, data) {
    if (type === 'subway') {
      var code = (data.errorMessage && data.errorMessage.code) || (data.RESULT && data.RESULT.CODE) || data.code;
      if (code === 'INFO-200') return [];
      if (code && code !== 'INFO-000') throw new Error('지하철 API 오류 (' + String(code).replace(/[^A-Z0-9-]/gi, '').slice(0, 24) + '). 키의 활용 승인과 역명을 확인하세요.');
      if (!Array.isArray(data.realtimeArrivalList)) throw new Error('지하철 응답 형식을 확인할 수 없습니다.');
      return data.realtimeArrivalList.map(function (item) {
        return { title: item.trainLineNm || item.bstatnNm || '지하철', message: item.arvlMsg2 || '정보 없음', detail: item.arvlMsg3 || '', line: String(item.subwayId || ''), direction: String(item.updnLine || '') };
      });
    }
    var header = data.msgHeader || {};
    if (String(header.headerCd) === '4') return [];
    if (String(header.headerCd) !== '0') throw new Error('버스 API 오류. 키의 활용 승인과 Decoding 키 사용 여부를 확인하세요.');
    if (!data.msgBody || !('itemList' in data.msgBody)) throw new Error('버스 응답 형식을 확인할 수 없습니다.');
    var items = data.msgBody.itemList || [];
    if (!Array.isArray(items)) items = [items];
    return items.map(function (item) {
      return { title: item.rtNm || '버스', message: item.arrmsg1 || '정보 없음', detail: item.arrmsg2 || '', stop: item.stNm || '' };
    });
  }
  function targets(settings) {
    var result = [];
    ['subway', 'bus'].forEach(function (type) {
      var key = type === 'subway' ? settings.subwayKey : settings.busKey;
      var input = String((type === 'subway' ? settings.station : settings.arsId) || '');
      var values = input.split(/[,，\n]+/).map(function (v) { return v.trim(); }).filter(Boolean);
      var seen = [];
      values.forEach(function (entry) {
        var parts = entry.split('/').map(function (v) { return v.trim(); });
        var target = { type: type, value: parts[0] };
        if (!target.value) throw new Error('역명 또는 정류소 번호를 입력하세요.');
        if (type === 'bus') {
          if (!/^\d{5}$/.test(target.value) || parts.length > 2) throw new Error('버스는 20276/동작08처럼 입력하세요.');
          if (parts[1]) target.route = parts[1];
        } else {
          if (target.value.length > 50 || parts.length > 3) throw new Error('지하철은 노들/9/공항방향처럼 입력하세요.');
          if (parts[1]) {
            var line = parts[1].replace(/호선$/, '');
            if (!/^[1-9]$/.test(line)) throw new Error('호선은 1~9 또는 비워두세요.');
            target.line = String(1000 + Number(line));
          }
          if (parts[2]) {
            var direction = parts[2];
            if (direction === '공항방향') {
              if (target.line !== '1009' || target.value !== '노들') throw new Error('공항방향은 노들/9에서 사용하세요. 다른 역은 상행·하행을 입력하세요.');
              target.direction = '상행';
              target.directionLabel = '공항방향';
            } else {
              if (['상행', '하행', '내선', '외선'].indexOf(direction) < 0) throw new Error('방향은 상행·하행·내선·외선 중 선택하세요. 노들/9는 공항방향도 지원합니다.');
              target.direction = direction;
            }
          }
        }
        var identity = JSON.stringify(target);
        if (seen.indexOf(identity) >= 0) return;
        seen.push(identity);
        if (seen.length > 10) throw new Error('서비스별로 최대 10곳까지 설정할 수 있습니다.');
        if (key) result.push(target);
      });
    });
    return result;
  }
  function filter(type, items, target) {
    return items.filter(function (item) {
      if (type === 'subway') return (!target.line || item.line === target.line) && (!target.direction || item.direction === target.direction);
      return !target.route || String(item.title).replace(/\s/g, '') === target.route.replace(/\s/g, '');
    });
  }
  function label(target) {
    if (target.type === 'bus') return '버스 · ' + target.value + (target.route ? ' · ' + target.route : '');
    return '지하철 · ' + target.value + (target.line ? ' · ' + (Number(target.line) - 1000) + '호선' : '') + (target.direction ? ' · ' + (target.directionLabel || target.direction) : '');
  }
  root.TransitAPI = { buildURL: buildURL, normalize: normalize, targets: targets, filter: filter, label: label };
})(typeof window !== 'undefined' ? window : globalThis);
