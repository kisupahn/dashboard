export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const unavailable = () => new ApiError(502, 'UPSTREAM_ERROR', '교통정보 제공기관에서 정상 응답을 받지 못했습니다.');
const list = value => value == null ? [] : Array.isArray(value) ? value : [value];
const str = value => value == null ? '' : String(value);

export function createTransit({ env = process.env, fetchImpl = fetch, now = Date.now } = {}) {
  const cache = new Map();
  const pending = new Map();
  const ttl = 15_000;

  async function request(url) {
    try {
      const response = await fetchImpl(url, {
        signal: AbortSignal.timeout(8000),
        headers: { Accept: 'application/json' },
        redirect: 'error',
      });
      if (!response.ok) throw unavailable();
      const body = await response.json();
      if (!body || typeof body !== 'object') throw unavailable();
      return body;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        throw new ApiError(504, 'UPSTREAM_TIMEOUT', '교통정보 조회 시간이 초과되었습니다. 잠시 후 다시 시도하세요.');
      }
      // 원본 오류에는 인증키가 포함된 URL이 있을 수 있으므로 노출하지 않습니다.
      throw unavailable();
    }
  }

  async function cached(key, load) {
    const hit = cache.get(key);
    if (hit && hit.expires > now()) return { ...hit.data, cached: true };
    if (pending.has(key)) return pending.get(key);
    // 무제한 병렬 요청으로 제공기관의 호출 한도를 소진하지 않도록 제한합니다.
    if (pending.size >= 20) throw new ApiError(503, 'BUSY', '조회 요청이 많습니다. 잠시 후 다시 시도하세요.');
    const job = (async () => {
      const data = { ...(await load()), fetchedAt: new Date(now()).toISOString(), cached: false };
      if (cache.size >= 300) cache.delete(cache.keys().next().value);
      cache.set(key, { data, expires: now() + ttl });
      return data;
    })();
    pending.set(key, job);
    try { return await job; } finally { pending.delete(key); }
  }

  return {
    subway(station) {
      station = str(station).trim();
      if (!/^[가-힣a-zA-Z0-9·ㆍ(). -]{1,50}$/u.test(station)) {
        throw new ApiError(400, 'INVALID_STATION', 'station에 역 이름을 입력하세요. 예: 서울, 강남');
      }
      if (!env.SEOUL_SUBWAY_API_KEY) throw new ApiError(503, 'NOT_CONFIGURED', '지하철 API 키가 설정되지 않았습니다.');
      return cached(`subway:${station}`, async () => {
        const base = (env.SEOUL_SUBWAY_BASE_URL || 'http://swopenapi.seoul.go.kr/api/subway/').replace(/\/?$/, '/');
        const url = new URL(`${encodeURIComponent(env.SEOUL_SUBWAY_API_KEY)}/json/realtimeStationArrival/0/100/${encodeURIComponent(station)}`, base);
        const data = await request(url);
        const code = data.errorMessage?.code ?? data.RESULT?.CODE ?? data.code;
        if (code === 'INFO-200') return { station, arrivals: [] };
        if (code && code !== 'INFO-000') throw unavailable();
        if (!Array.isArray(data.realtimeArrivalList)) throw unavailable();
        return {
          station,
          arrivals: data.realtimeArrivalList.map(item => ({
            lineId: str(item.subwayId), station: str(item.statnNm),
            direction: str(item.updnLine), destination: str(item.bstatnNm),
            trainLine: str(item.trainLineNm), trainId: str(item.btrainNo),
            secondsUntilArrival: /^\d+$/.test(str(item.barvlDt)) ? Number(item.barvlDt) : null,
            message: str(item.arvlMsg2), detail: str(item.arvlMsg3),
            arrivalCode: str(item.arvlCd), updatedAt: str(item.recptnDt),
          })),
        };
      });
    },
    bus(arsId) {
      arsId = str(arsId).trim();
      if (!/^\d{5}$/.test(arsId)) throw new ApiError(400, 'INVALID_STOP', 'arsId에 5자리 정류소 번호를 입력하세요. 예: 01001');
      if (!env.SEOUL_BUS_API_KEY) throw new ApiError(503, 'NOT_CONFIGURED', '버스 API 키가 설정되지 않았습니다.');
      return cached(`bus:${arsId}`, async () => {
        const url = new URL(env.SEOUL_BUS_BASE_URL || 'https://ws.bus.go.kr/api/rest/stationinfo/getStationByUid');
        url.searchParams.set('serviceKey', env.SEOUL_BUS_API_KEY);
        url.searchParams.set('arsId', arsId);
        url.searchParams.set('resultType', 'json');
        const data = await request(url);
        const code = str(data.msgHeader?.headerCd);
        if (code === '4') return { arsId, stopName: null, arrivals: [] };
        if (code !== '0') throw unavailable();
        if (!data.msgBody || !('itemList' in data.msgBody)) throw unavailable();
        const items = list(data.msgBody.itemList);
        return {
          arsId, stopName: items[0]?.stNm ?? null,
          arrivals: items.map(item => ({
            routeId: str(item.busRouteId), routeName: str(item.rtNm),
            routeType: str(item.routeType), direction: str(item.adirection),
            first: { message: str(item.arrmsg1), vehicleId: str(item.vehId1), congestion: str(item.congestion1) },
            second: { message: str(item.arrmsg2), vehicleId: str(item.vehId2), congestion: str(item.congestion2) },
          })),
        };
      });
    },
  };
}
