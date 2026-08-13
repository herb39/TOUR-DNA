// 2026-08-13: Network DNA 산식을 attraction+PoiRelation+coverage(50/20/30)에서 attraction+음식/숙박/
// 체험 조합 가능성(B/H1, 50/50)으로 재설계 — 분석 결과가 바뀌는 model change라 minor 버전을 올린다.
// dataset/baseYm 변경(Dataset.ACTIVE)과 이 model version은 서로 다른 개념이다 — 전자는 "어느 시점의
// 데이터를 보는가", 후자는 "그 데이터를 어떤 산식으로 해석하는가"다(docs/scoring-model.md 참고).
export const MODEL_VERSION = "tour-dna-v1.1.0";
