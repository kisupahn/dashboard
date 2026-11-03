# 교통 API 공식 명세 검토

검토일: 2026-11-03. 공식 웹 명세와 공공데이터포털의 버스 활용가이드 원문을 읽고 현재 구현과 대조한 기록입니다. 실제 인증키를 이용한 호출 결과와 구분합니다. 이 문서 작성에서 실행 코드는 변경하지 않았습니다.

## 확인한 공식 자료

- [지하철 API 명세](https://data.seoul.go.kr/dataList/openApiView.do?infId=OA-12764&srvType=A)
- [지하철 데이터 안내 및 데이터 시차 주의사항](https://data.seoul.go.kr/dataList/OA-12764/A/1/datasetView.do)
- [버스도착정보조회 서비스: 15000314](https://www.data.go.kr/data/15000314/openapi.do)
- 위 페이지 참고문서 `서울특별시_버스도착정보조회_서비스_활용가이드_20250814.docx`를 다운로드하고 요청·응답·오류코드 표 확인.
- [서울시의 정류소·노선별 도착정보 안내](https://data.seoul.go.kr/dataList/OA-15346/F/1/datasetView.do)
- [정류소정보조회 서비스: 15000303](https://www.data.go.kr/data/15000303/openapi.do)
- [서울시의 getStationByUid 안내](https://data.seoul.go.kr/dataList/OA-15331/F/1/datasetView.do)

## 지하철

공식 샘플의 기본 주소는 HTTP입니다.

```text
http://swopenAPI.seoul.go.kr/api/subway/{KEY}/json/realtimeStationArrival/0/100/{statnNm}
```

역명으로 요청하며 호선·방향은 요청 파라미터가 아닙니다. 응답을 필터링해야 합니다.

| 필드 | 의미 / 사용 |
| --- | --- |
| subwayId | 호선 ID. 9호선은 1009 |
| updnLine | 상행·하행 또는 내선·외선 |
| trainLineNm | 종착지와 다음 역 방면 정보 |
| bstatnNm | 종착역 |
| btrainSttus | 일반·급행 등의 열차 종류 |
| barvlDt | 도착예정 초 |
| arvlMsg2 / arvlMsg3 | 도착 안내 / 추가 안내. 서로 다른 두 열차가 아님 |
| ordkey | 도착 열차 순번 등의 정렬 정보 |
| recptnDt | 제공기관에서 도착정보를 생성한 시각 |

노들/9/공항방향은 우리 화면의 설정 문법이며 API가 이해하는 자연어가 아닙니다. 현재 코드는 공항방향을 상행으로 고정했으나, 이 API 명세에는 노들역의 방면별 매핑이 없습니다. 실제 `trainLineNm`, `bstatnNm`, `updnLine`을 대조하기 전에는 이 매핑을 검증 완료로 간주하면 안 됩니다. 일반 시간표와 실시간 API의 방향 코드도 동일하다고 가정하지 않습니다.

`recptnDt`와 화면의 조회 시각은 다릅니다. 오래된 정보를 구분해야 하며, 공식 안내는 생성 이후 경과시간을 고려하도록 설명합니다. 샘플 키는 서울역에만 사용 가능하여 노들역 검증을 대체하지 못합니다.

## 버스

사용자가 신청한 것은 15000314입니다. 현재 프런트엔드와 백엔드의 `stationinfo/getStationByUid`는 별도 서비스 15000303에 속합니다. 동일 포털의 인증키라도 해당 서비스 활용 승인이 확보되었다고 가정할 수 없습니다.

신청한 버스도착정보 서비스의 두 가지 경로:

```text
http://ws.bus.go.kr/api/rest/arrive/getArrInfoByRoute
  ?serviceKey={KEY}&stId={정류소ID}&busRouteId={노선ID}&ord={순번}&resultType=json

http://ws.bus.go.kr/api/rest/arrive/getArrInfoByRouteAll
  ?serviceKey={KEY}&busRouteId={노선ID}&resultType=json
```

첫 경로는 내부 ID 두 개와 정류소 순번이 필요합니다. 두 번째는 노선 ID만으로 전체 정류소를 받고 `arsId`로 고를 수 있습니다. 명세의 기능명 `getArrInfoByRouteList`와 실제 URL의 `getArrInfoByRoute`를 혼동하지 않아야 합니다. JSON은 가이드에서 `resultType=json`으로 지원됨을 확인했습니다.

`20276`, `20014`는 5자리 ARS 번호이며 `stId`가 아닙니다. `동작08`, `360`은 노선명이며 `busRouteId`가 아닙니다. ID는 공식 자료나 조회 API로 확보하고 검증해야 합니다. 이 검토에서 해당 ID를 추정하거나 확정하지 않았습니다.

주요 응답은 `arsId`, `stId`, `busRouteId`, `staOrd`, `rtNm`, `stNm`, `arrmsg1`, `arrmsg2`입니다. 버스의 두 메시지는 첫 번째·두 번째 도착 예정 차량입니다. `rtNm`은 DB 관리용 노선명이고 `busRouteAbrv`는 안내용 약칭(마을버스 제외)이므로 표시 이름과 식별 ID를 구분해야 합니다.

가이드 오류코드 4는 노선 없음, 6은 실시간정보 읽기 실패, 8은 운행 종료입니다. 현재 코드의 4 → 빈 정상 결과 처리는 수정 대상입니다. 포털 페이지에서 개발 트래픽 1,000을 확인했으며 실제 승인 한도는 사용자 계정에서 확인해야 합니다. 두 버스 조건을 매분 하루 종일 각각 요청하면 이론상 2,880회이므로 갱신 주기를 한도와 맞춰야 합니다.

## 수정 및 검증 순서

1. 버스 호출을 신청한 arrive 서비스에 맞추고 노선 ID를 확보. 가능하면 RouteAll + ARS 필터로 추가 서비스 의존을 줄임.
2. 실제 노들역 응답으로 공항 방면 방향 매핑 검증.
3. 오류 코드, 표시용 노선명, 제공기관 생성 시각 반영.
4. HTTPS 연결과 CORS를 실제 M7에서 각각 확인. HTTP로 적힌 명세만으로 HTTPS·CORS 지원을 단정하지 않음.

자동 테스트는 구현의 동작을 검증했을 뿐, 제공기관 계약 및 실제 응답 검증의 증거가 아닙니다.

## 후속 구현: 정적 파일로 ID 확보

공식 [OA-15262](https://data.seoul.go.kr/dataList/OA-15262/F/1/datasetView.do)의 노선ID정보(20260902)와 [OA-1095](https://data.seoul.go.kr/dataList/OA-1095/L/1/datasetView.do)의 노선별정류소정보(20260902)를 내려받아 대조했습니다. 노선 ID 사전 생성은 `scripts/build-route-catalog.py`로 재현합니다. 동작08=119900009, 360=100100057입니다. 20014·360은 stId 119000014 / ord 35입니다. 20276은 파일에 없으며, 20726은 동작08 신동아정문입니다. 사용자 확인 없이 번호를 바꾸지 않습니다.

이후 구현은 RouteAll + ARS·노선ID 필터를 사용하며, 위 검토 시점의 잘못된 stationinfo 코드 및 백엔드는 제거했습니다. 노들 공항 방면은 상행/하행 추정 대신 `trainLineNm`의 노량진방면을 확인합니다. 실제 응답 검증은 여전히 별도입니다.
