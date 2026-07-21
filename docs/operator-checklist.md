# 운영자 체크리스트

## 최초 배포 전

- [x] Neon 프로젝트 생성, `DATABASE_URL`/`DIRECT_URL` 발급 및 등록
- [x] `npm run db:migrate` 실행 확인
- [x] `npm run db:seed` 실행 확인 (대전/제천/양양 fixture + 데모 프로젝트 생성)
- [x] 카카오 개발자 콘솔 애플리케이션 등록 및 배포 도메인 허용 목록 등록(**"JavaScript 키 > JavaScript
      SDK 도메인"**에 `https://tour-dna.lib.lc` 등록 완료). ⚠️ 이 과정에서 Vercel에 잘못된 키 값이
      설정돼 있던 것을 발견·수정함 — 아래 참고.
- [x] `CRON_SECRET`을 임의의 강한 값으로 설정(빈 값이면 모든 sync 요청이 401 처리됨을 확인)
- [x] `npm run build` 로컬 통과 확인
- [ ] `npm run test:e2e` 통과 확인(개발 서버 기동 상태에서)
- [x] Vercel 배포 완료(`tour-dna.lib.lc`), Vercel Cron 등록(매월 1일)

## 공공데이터 API 실 키 발급 후 (필수 재검증) — 2026-07-21 대부분 완료

- [x] `TOUR_API_SERVICE_KEY` 발급 완료
- [x] 지역 코드 체계 확정: 통계청 행정표준코드(`AreaTarDemDsService`/`AreaTarDivService`용, 대전 유성구
      =30/30200, 제천=43/43150, 양양=51/51830) + TourAPI 구코드(`KorService2`용, 대전=3/충북=33/강원=32)
- [x] 지역별 관광 수요 강도: 체류(`/areaTarSjrnDsList`, tarSjrnDsIxCd=2103)·소비(`/areaTarExpDsList`,
      tarExpDsIxCd=2201) 코드 파라미터까지 확인, 3개 지역(대전 유성구/제천/양양) 전부 실제 데이터 확인,
      어댑터 반영 완료
- [x] 지역별 관광 다양성: `/areaTouDivList`(touDivIxCd=3103) 실제 데이터 확인, 어댑터 반영
- [x] 국문 관광정보 서비스: `KorService2/areaBasedList2` 실제 데이터 확인, 어댑터 반영(POI upsert 연결은 미완)
- [x] 수요(Demand) 지수 오퍼레이션명 확인 완료 — Swagger UI 확인 결과 `AreaTarDemDsService`에는 체류/
      소비 2개 오퍼레이션만 존재, 별도 수요 오퍼레이션 없음(docs/public-api-status.md 참고)
- [ ] `AreaTarDivService`의 `areaExpDivList`/`areaIntlDivList` 코드 파라미터명 확인
- [x] ⚠️ **다양성 지표 저장 보류 처리 완료(2026-07-21)**: `touDivIxCd=3103`("30대 방문객수")은 종합
      다양성 점수가 아니라서, 여러 연령/유형 코드를 모아 재계산하는 로직이 준비되기 전까지
      `syncService.ts`에서 이 값을 `NormalizedMetric`에 쓰지 않도록 막았다(SyncLog에는 API 연결
      확인용으로 `SKIPPED` 상태로 계속 기록됨). Cron이 매월 1일 실행돼도 더 이상 fixture 다양성 점수를
      덮어쓰지 않는다. 재계산 로직 자체는 여전히 미구현 — 나중에 여러 `touDivIxCd`를 확보하면 이 보류를
      풀고 실제 재계산 로직으로 교체할 것.
- [ ] 지역별 관광 자원 수요·방문자수·연관관광지 API의 실제 base URL·오퍼레이션명 확인
- [x] `npm run sync:tourism-data`로 실 데이터 동기화 및 `SyncLog` 결과 확인 완료(다양성·체류·소비 성공,
      확인 직후 데모 안정성을 위해 `npm run db:seed`로 fixture 값 복원)
- [ ] `docs/public-api-status.md`의 "다음 재검증 시 확인할 것" 항목을 확인된 내용으로 갱신

## 정기 운영

- [ ] Cron이 매월 1일 정상 실행되는지 `SyncLog`로 확인 — 다양성 지표는 재계산 로직 구현 전까지 저장을
      의도적으로 보류 중이니 `TOU_DIV_IX` 결과가 `SKIPPED`로 나오는 것이 정상이다(위 항목 참고)
- [ ] 부분 실패(`PARTIAL`) 발생 시 어떤 API가 실패했는지 `SyncLog.results`에서 확인,
      해당 API만 재시도(기존 성공 데이터는 유지되므로 서비스는 계속 정상 동작)
- [ ] `TOUR_DATA_BASE_YM`을 새 기준월로 교체할 때는 새 기준월 데이터가 실제로 존재하는지
      먼저 CLI로 확인 후 배포 환경변수를 갱신

## 알려진 사고 사례

- **카카오맵 JS 키 불일치(2026-07-21 발견·수정)**: Vercel `NEXT_PUBLIC_KAKAO_MAP_KEY`에 실수로 다른
  키 값이 설정돼 있어(카카오 콘솔의 실제 "JavaScript 키"와 불일치) 배포 사이트에서 지도가 항상
  좌표/주소 fallback으로만 표시됐다. `MapOrFallback.tsx`의 fallback 문구가 "키가 설정되지 않아"로
  고정돼 있어 원인 진단이 어려웠던 것도 문제 — 이제 키 없음(NO_KEY)과 로드 실패(LOAD_FAILED, SDK
  도메인 미등록 등)를 구분해 표시하도록 수정했다. 카카오 개발자 콘솔의 "JavaScript 키" 값과
  `NEXT_PUBLIC_KAKAO_MAP_KEY`가 정확히 일치하는지 항상 재확인할 것(REST API 키 등 다른 키 종류와
  혼동하기 쉽다).

## 사고 대응

- [ ] 공공데이터 API가 전면 장애이거나 다양성 지표가 의도치 않게 바뀌었을 때: `DATA_MODE=snapshot`으로
      임시 전환해 라이브 호출을 완전히 끄고 마지막 성공 스냅샷으로 서비스 지속 가능(환경변수만 변경 후
      재배포, 코드 변경 불필요)
- [ ] 잘못된 동기화로 데이터가 이상해졌을 때: `npm run db:seed`를 재실행하면 fixture 값으로 복원된다
      (NormalizedMetric은 upsert 방식이라 seed의 고정값으로 되돌아간다)
