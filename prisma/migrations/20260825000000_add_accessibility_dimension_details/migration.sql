-- Add normalized ACCESSIBILITY dimension details without changing PET semantics.
ALTER TABLE "PoiConditionEvidence" ADD COLUMN "dimensionDetails" JSONB;
