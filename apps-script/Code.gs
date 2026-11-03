// 교통정보 전용 프로젝트에 붙여넣으세요. 기존 메모 프로젝트의 doGet과 합치지 마세요.
// 스크립트 속성: SEOUL_SUBWAY_API_KEY, SEOUL_BUS_API_KEY, DASHBOARD_TOKEN(16자 이상)
function doGet(e) {
  var p = (e && e.parameter) || {};
  var callback = p.callback || '';
  if (callback && !/^__seoulRelay_[A-Za-z0-9_]{1,80}$/.test(callback)) {
    return ContentService.createTextOutput('Invalid callback').setMimeType(ContentService.MimeType.TEXT);
  }
  var result;
  try {
    var props = PropertiesService.getScriptProperties();
    var token = props.getProperty('DASHBOARD_TOKEN');
    if (!token || token.length < 16 || p.token !== token) throw relayError_('AUTH', '중계 접속 코드가 일치하지 않습니다.');
    if (p.type === 'health') {
      result = { ok: true, version: 1, configured: { subway: !!props.getProperty('SEOUL_SUBWAY_API_KEY'), bus: !!props.getProperty('SEOUL_BUS_API_KEY') } };
    } else {
      var key, url, cacheKey;
      if (p.type === 'subway') {
        if (!/^[가-힣A-Za-z0-9·ㆍ(). -]{1,50}$/.test(p.station || '')) throw relayError_('INPUT', '역명을 확인하세요.');
        key = props.getProperty('SEOUL_SUBWAY_API_KEY');
        url = 'http://swopenapi.seoul.go.kr/api/subway/' + encodeURIComponent(key || '') + '/json/realtimeStationArrival/0/100/' + encodeURIComponent(p.station);
        cacheKey = 'subway:' + p.station;
      } else if (p.type === 'bus') {
        if (!/^\d{9}$/.test(p.routeId || '')) throw relayError_('INPUT', '내부 노선 ID를 확인하세요.');
        key = props.getProperty('SEOUL_BUS_API_KEY');
        url = 'http://ws.bus.go.kr/api/rest/arrive/getArrInfoByRouteAll?serviceKey=' + encodeURIComponent(key || '') + '&busRouteId=' + p.routeId + '&resultType=json';
        cacheKey = 'bus:' + p.routeId;
      } else throw relayError_('INPUT', '지원하지 않는 조회입니다.');
      if (!key) throw relayError_('CONFIG', 'Apps Script의 API 키 속성을 설정하세요.');
      // 키가 바뀌면 이전 키의 캐시도 공유하지 않습니다.
      cacheKey += ':' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, key));
      var cache = CacheService.getScriptCache();
      var cached = cache.get(cacheKey);
      if (cached) result = JSON.parse(cached);
      else {
        var response;
        try { response = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: false }); }
        catch (_) { throw relayError_('UPSTREAM', 'Google에서 교통 API에 연결하지 못했습니다.'); }
        if (response.getResponseCode() !== 200) throw relayError_('UPSTREAM', '교통 API HTTP 오류 (' + response.getResponseCode() + '). 키 승인과 한도를 확인하세요.');
        var data;
        try { data = JSON.parse(response.getContentText()); }
        catch (_) { throw relayError_('FORMAT', '교통 API가 JSON 대신 다른 응답을 보냈습니다.'); }
        // 오류 원문에는 키가 포함될 수 있어 성공한 자료만 전달합니다.
        if (p.type === 'subway') {
          var code = (data.errorMessage || {}).code || (data.RESULT || {}).CODE || data.code;
          if (code === 'INFO-200') data = { realtimeArrivalList: [] };
          else if ((code && code !== 'INFO-000') || !Array.isArray(data.realtimeArrivalList)) throw relayError_('PROVIDER', '지하철 API 오류. 키·역명·호출 한도를 확인하세요.');
        } else {
          var busCode = String((data.msgHeader || {}).headerCd);
          if (busCode !== '0') {
            var messages = { '3': '정류소를 찾을 수 없습니다.', '4': '노선을 찾을 수 없습니다.', '6': '실시간정보 읽기에 실패했습니다.', '8': '운행 종료되었습니다.' };
            throw relayError_(busCode === '8' ? 'SERVICE_ENDED' : 'PROVIDER', messages[busCode] || '버스 API 오류. 활용 승인·키·한도를 확인하세요.');
          }
        }
        result = { ok: true, data: data, fetchedAt: new Date().toISOString() };
        var encoded = JSON.stringify(result);
        if (encoded.length < 45000) cache.put(cacheKey, encoded, 150);
      }
    }
  } catch (err) {
    result = { ok: false, error: { code: err.relayCode || 'INTERNAL', message: err.relayCode ? err.message : '중계 설정 또는 실행 오류가 발생했습니다.' } };
  }
  var output = JSON.stringify(result).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return ContentService.createTextOutput(callback ? callback + '(' + output + ');' : output)
    .setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}
function relayError_(code, message) { var err = new Error(message); err.relayCode = code; return err; }
// 편집기에서 한 번 실행해 외부 연결 권한을 승인하고, 실행 결과는 API 키 없는 샘플로 확인합니다.
function authorizeAndTest() {
  var response = UrlFetchApp.fetch('http://swopenapi.seoul.go.kr/api/subway/sample/json/realtimeStationArrival/0/5/' + encodeURIComponent('서울'), { muteHttpExceptions: true });
  console.log('Sample HTTP status: ' + response.getResponseCode());
}
