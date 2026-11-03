"""서울시 OA-15262의 노선ID정보 XLSX를 JS 사전으로 변환. 외부 패키지 불필요.
사용: python3 scripts/build-route-catalog.py 원본.xlsx > route-catalog.js
공식 출처 및 버전은 README.md 참조. 새 파일로 갱신 시 날짜 주석도 갱신하세요.
"""
import json
import sys
import zipfile
import xml.etree.ElementTree as ET

ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(sys.argv[1]) as archive:
    shared = ET.fromstring(archive.read('xl/sharedStrings.xml'))
    strings = [''.join(node.itertext()) for node in shared.findall('s:si', ns)]
    sheet = ET.fromstring(archive.read('xl/worksheets/sheet1.xml'))
    routes = {}
    for row in sheet.findall('.//s:row', ns)[1:]:
        cells = {}
        for cell in row.findall('s:c', ns):
            node = cell.find('s:v', ns)
            value = node.text if node is not None else ''
            if cell.attrib.get('t') == 's':
                value = strings[int(value)]
            cells[cell.attrib['r'].rstrip('0123456789')] = value
        name, route_id = cells.get('A'), cells.get('B')
        if name and route_id and route_id.isdigit() and len(route_id) == 9:
            if name in routes and routes[name] != route_id:
                raise ValueError('동명이 노선: ' + name)
            routes[name] = route_id
if not routes:
    raise ValueError('노선 ID 컬럼을 확인하세요.')
print('// 서울 열린데이터광장 OA-15262, 2026-09-02. 공공누리 제1유형.')
print('// 원본과 추출 절차: docs/transit-api-review.md')
print('(function(root) { root.SeoulRoutes = ' + json.dumps(routes, ensure_ascii=False, separators=(',', ':')) + '; })(typeof window !== "undefined" ? window : globalThis);')
