import { prisma } from "@/lib/db";

export interface RegionOption {
  code: string;
  name: string;
  sigungus: { code: string; name: string }[];
}

export async function getRegionOptions(): Promise<RegionOption[]> {
  const regions = await prisma.region.findMany({ orderBy: { name: "asc" } });
  const sidos = regions.filter((r) => r.level === "SIDO");
  const sigungus = regions.filter((r) => r.level === "SIGUNGU");

  return sidos.map((sido) => ({
    code: sido.code,
    name: sido.name,
    sigungus: sigungus
      .filter((s) => s.parentId === sido.id)
      .map((s) => ({ code: s.code, name: s.name })),
  }));
}
