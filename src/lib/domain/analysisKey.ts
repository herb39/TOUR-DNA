import { createHash } from "node:crypto";

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortDeep((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

export interface AnalysisKeyParams {
  input: unknown; // ProjectInput (정렬 후 해시)
  dataVersion: string;
  modelVersion: string;
}

/** analysisKey = hash(sortedInput + dataVersion + modelVersion). 동일 입력·버전이면 항상 동일한 키를 반환한다. */
export function computeAnalysisKey({ input, dataVersion, modelVersion }: AnalysisKeyParams): string {
  const payload = `${JSON.stringify(sortDeep(input))}|${dataVersion}|${modelVersion}`;
  return createHash("sha256").update(payload).digest("hex");
}
