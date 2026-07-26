-- Phase 5-B (2026-07-26): 홍보자료(promo content) 저장 컬럼 추가.
-- 기존 SelectedPlan 행은 이 값을 만든 적이 없으므로 NULL로 남긴다 — 기본 홍보 콘텐츠를 임의로 채우지 않는다.

-- AlterTable
ALTER TABLE "SelectedPlan" ADD COLUMN     "promoContent" JSONB;
