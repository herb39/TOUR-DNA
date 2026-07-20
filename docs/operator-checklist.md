# 운영자 체크리스트

## 최초 배포 전

- [x] Neon 프로젝트 생성, `DATABASE_URL`/`DIRECT_URL` 발급 및 등록
- [x] `npm run db:migrate` 실행 확인
- [x] `npm run db:seed` 실행 확인 (대전/제천/양양 fixture + 데모 프로젝트 생성)
- [ ] 카카오 개발자 콘솔 애플리케이션 등록 및 배포 도메인 허용 목록 등록 — **"JavaScript 키 > JavaScript
      SDK 도메인"**에 등록해야 지도가 실제로 뜬다("제품 링크 관리 > 웹 도메인"은 카카오톡 공유 링크용,
      다른 설정임)
- [x] `CRON_SECRET`을 임의의 강한 값으로 설정(빈 값이면 모든 sync 요청이 401 처리됨을 확인)
- [x] `npm run build` 로컬 통과 확인
- [ ] `npm run test:e2e` 통과 확인(개발 서버 기동 상태에서)
- [x] Vercel 배포 완료(`tour-dna.lib.lc`), Vercel Cron 등록(매월 1일)

## 공공데이터 API 실 키 발급 후 (필수 재검증) — 2026-07-21 대부분 완료

- [x] `TOUR_API_SERVICE_KEY` 발급 완료
- [x] 지역 코드 체계 확정: 통계청 행정표준코드(`AreaTarDemDsService`/`AreaTarDivService`용, 대전 유성구
      =30/30200, 제천=43/43150, 양양=51/51830) + TourAPI 구코드(`KorService2`용, 대전=3/충북=33/강원=32)
- [x] 지역별 관광 수요 강도: 체류(`/areaTarSjrnDsList`)·소비(`/areaTarExpDsList`) 오퍼레이션 확인
- [x] 지역별 관광 다양성: `/areaTouDivList`(touDivIxCd=3103) 실제 데이터 확인, 어댑터 반영
- [x] 국문 관광정보 서비스: `KorService2/areaBasedList2` 실제 데이터 확인, 어댑터 반영(POI upsert 연결은 미완)
- [ ] 수요(Demand) 지수 오퍼레이션명 확인 필요 — Swagger UI에서 `AreaTarDemDsService` 전체 오퍼레이션 목록 확인
- [ ] `AreaTarDemDsService`(체류/소비)가 **0건이 아닌 실제 데이터**를 반환하는 조합 확인 — 현재 대전
      유성구 포함 다수 조합에서 전부 0건(호출 자체는 정상)
- [ ] `AreaTarDivService`의 `areaExpDivList`/`areaIntlDivList` 코드 파라미터명 확인
- [ ] ⚠️ **다양성 지표 재계산 로직 필요**: 현재 `touDivIxCd=3103`("30대 방문객수") 단일 값을 그대로
      쓰는데, 이는 종합 다양성 점수가 아니다. 여러 연령/유형 코드를 모아 분산으로 재계산하기 전까지는
      `npm run sync:tourism-data`나 Cron 실행 시 데모의 다양성 점수가 의미가 다른 값으로 바뀔 수 있다.
      운영 중 이 문제를 인지하고 있을 것.
- [ ] 지역별 관광 자원 수요·방문자수·연관관광지 API의 실제 base URL·오퍼레이션명 확인
- [x] `npm run sync:tourism-data`로 실 데이터 1회 동기화 및 `SyncLog` 결과 확인 완료(다양성만 성공)
- [ ] `docs/public-api-status.md`의 "다음 재검증 시 확인할 것" 항목을 확인된 내용으로 갱신

## 정기 운영

- [ ] Cron이 매월 1일 정상 실행되는지 `SyncLog`로 확인 — **다양성 지표 재계산 로직 구현 전까지는
      Cron이 데모 다양성 점수를 의미가 다른 값으로 덮어쓸 수 있음에 유의**(위 항목 참고)
- [ ] 부분 실패(`PARTIAL`) 발생 시 어떤 API가 실패했는지 `SyncLog.results`에서 확인,
      해당 API만 재시도(기존 성공 데이터는 유지되므로 서비스는 계속 정상 동작)
- [ ] `TOUR_DATA_BASE_YM`을 새 기준월로 교체할 때는 새 기준월 데이터가 실제로 존재하는지
      먼저 CLI로 확인 후 배포 환경변수를 갱신

## 사고 대응

- [ ] 공공데이터 API가 전면 장애이거나 다양성 지표가 의도치 않게 바뀌었을 때: `DATA_MODE=snapshot`으로
      임시 전환해 라이브 호출을 완전히 끄고 마지막 성공 스냅샷으로 서비스 지속 가능(환경변수만 변경 후
      재배포, 코드 변경 불필요)
- [ ] 잘못된 동기화로 데이터가 이상해졌을 때: `npm run db:seed`를 재실행하면 fixture 값으로 복원된다
      (NormalizedMetric은 upsert 방식이라 seed의 고정값으로 되돌아간다)
