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
        return { title: item.trainLineNm || item.bstatnNm || '지하철', message: item.arvlMsg2 || '정보 없음', detail: item.arvlMsg3 || '', line: String(item.subwayId || '') };
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
      values = values.filter(function (v, i) { return values.indexOf(v) === i; });
      if (values.length > 10) throw new Error('서비스별로 최대 10곳까지 설정할 수 있습니다.');
      values.forEach(function (value) {
        if (type === 'bus' && !/^\d{5}$/.test(value)) throw new Error('정류소 번호는 각각 5자리 숫자로 입력하세요.');
        if (type === 'subway' && value.length > 50) throw new Error('역명은 각각 50자 이내로 입력하세요.');
        if (key) result.push({ type: type, value: value });
      });
    });
    return result;
  }
  root.TransitAPI = { buildURL: buildURL, normalize: normalize, targets: targets };
})(typeof window !== 'undefined' ? window : globalThis);
