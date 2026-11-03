# 서울 교통 대시보드

기존 HTML 화면과 서울 지하철·버스 도착정보 조회용 Node.js 백엔드입니다. 외부 npm 패키지나 DB 없이 실행합니다. 프런트엔드 도착정보 표시는 아직 연결하지 않았습니다.

## 실행

Node.js 22 이상이 필요합니다.

```sh
cp .env.example .env
# .env에 API 키를 입력한 뒤 실행
npm start
```

브라우저에서 `http://127.0.0.1:3000`을 엽니다. 자동 재시작은 `npm run dev`, 테스트는 `npm test`입니다.

## 키 설정

- `SEOUL_SUBWAY_API_KEY`: 서울 열린데이터광장의 **서울시 지하철 실시간 도착정보** 인증키.
- `SEOUL_BUS_API_KEY`: 공공데이터포털의 **서울특별시 버스도착정보조회 서비스** 활용 승인을 받은 일반 인증키 **Decoding** 값. Encoding 값은 이중 인코딩됩니다.

발급처가 다른 두 키를 사용합니다. 한쪽 키만 설정해도 해당 서비스는 사용할 수 있습니다. `.env`는 Git에서 제외합니다. 키를 HTML이나 커밋에 넣지 마세요. 변경 후 서버를 재시작하세요.

지하철 기본 주소는 제공기관의 공식 HTTP 주소입니다. 해당 구간의 키와 응답은 암호화되지 않습니다. 제공기관에서 HTTPS를 지원하는지 확인한 뒤 `SEOUL_SUBWAY_BASE_URL`로 변경할 수 있습니다. 버스는 HTTPS를 사용합니다. 실제 키를 이용한 제공기관 연결 검증은 별도로 필요합니다.

## 엔드포인트

```sh
curl http://127.0.0.1:3000/api/health
curl --get --data-urlencode 'station=서울' http://127.0.0.1:3000/api/subway/arrivals
curl 'http://127.0.0.1:3000/api/bus/arrivals?arsId=01001'
```

| 경로 | 입력 | 결과 |
| --- | --- | --- |
| `/api/health` | 없음 | 프로세스 상태, 키 설정 여부. 제공기관 연결 상태를 의미하지 않음 |
| `/api/subway/arrivals` | `station`: 역명 (예: 서울, 강남) | `station`, `arrivals` |
| `/api/bus/arrivals` | `arsId`: 앞자리 0을 포함한 5자리 정류소 번호 | `arsId`, `stopName`, `arrivals` |

지하철 도착 항목: `lineId`, `station`, `direction`, `destination`, `trainLine`, `trainId`, `secondsUntilArrival`, `message`, `detail`, `arrivalCode`, `updatedAt`. `lineId`는 제공기관 호선 ID입니다. 도착 초는 숫자 또는 `null`이며, 도착·진입 여부는 메시지와 도착 코드도 함께 사용하세요.

버스 항목: `routeId`, `routeName`, `routeType`, `direction`, `first`, `second`. `first`와 `second`에는 `message`, `vehicleId`, `congestion`이 있습니다. 운행 종료 등의 안내도 메시지로 전달됩니다.

조회 응답에는 `fetchedAt`(서버 조회 시각, UTC), `cached`가 포함됩니다. 정보가 없으면 `arrivals: []`입니다. 동일 조회는 15초간 메모리에 캐시하고 진행 중인 동일 요청은 병합합니다. 재시작 시 캐시는 초기화됩니다. 지하철은 한 번에 최대 100건을 조회합니다.

오류 형식: `{ "error": { "code": "...", "message": "..." } }`. HTTP 400은 입력 오류, 503은 키 미설정 또는 동시 요청 초과, 502는 제공기관·네트워크·응답 오류, 504는 8초 타임아웃입니다. 원본 오류와 인증키는 클라이언트에 전달하지 않습니다.

화면에서는 같은 출처의 `/api/...`를 호출하세요. CORS는 열지 않습니다.

```js
const response = await fetch('/api/subway/arrivals?station=' + encodeURIComponent('강남'));
const data = await response.json();
if (!response.ok) throw new Error(data.error.message);
console.log(data.arrivals);
```

## 운영

기본 바인딩은 로컬 전용 `127.0.0.1:3000`입니다. 컨테이너나 리버스 프록시에서 필요하면 `HOST=0.0.0.0`과 `PORT`를 설정하세요. 방문자 인증은 없으므로 인터넷 공개 시 앞단에 HTTPS, 접근 제어, 호출 제한을 설정해야 합니다. 캐시와 병렬 요청 제한은 인스턴스별입니다. 제공기관의 활용 한도에 맞춰 조회 주기를 정하세요.

기존 시계·카운터·외부 메모 화면은 유지합니다. 정적 제공은 `index.html`과 `script.js`만 허용합니다.
