"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";

export async function selectStrategyAction(projectId: string, strategyResultId: string) {
  const strategy = await prisma.strategyResult.findFirst({
    where: { id: strategyResultId, analysisResult: { projectId } },
  });
  if (!strategy) {
    throw new Error("선택한 전략을 찾을 수 없습니다.");
  }
  await prisma.project.update({
    where: { id: projectId },
    data: { selectedStrategyResultId: strategyResultId },
  });
  redirect(`/projects/${projectId}/plan`);
}
