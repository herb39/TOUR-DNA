// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { FestivalAnchorPanel } from "@/components/festival/FestivalAnchorPanel";
import type { FestivalAnchorLookup } from "@/lib/services/festivalAnchorService";

const lookup: FestivalAnchorLookup = {
  status: "AVAILABLE",
  candidates: [
    {
      id: "tourapi-festival-1",
      externalId: "1",
      name: "여름 강변 축제",
      startDate: "2026-08-01",
      endDate: "2026-08-03",
      address: "대전광역시 유성구",
      lat: 36.36,
      lng: 127.35,
      telephone: null,
      imageUrl: null,
      sourceLabel: "한국관광공사 TourAPI 행사정보",
    },
  ],
  message: "1건을 확인했습니다.",
  provenance: {
    provider: "한국관광공사",
    dataset: "행사정보 조회(searchFestival2)",
    regionCode: "SGG_DAEJEON",
    travelYear: 2026,
    travelMonth: 8,
    eventStartDate: "2026-08-01",
    eventEndDate: "2026-08-31",
    fetchedAt: "2026-08-18T16:00:00.000Z",
    apiItemCount: 1,
    matchedItemCount: 1,
  },
};

describe("FestivalAnchorPanel", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("후보를 선택하고 새로고침해도 프로젝트별 선택을 복원한다", async () => {
    const props = { projectId: "project-1", regionName: "대전 유성구", travelYear: 2026, travelMonth: 8, lookup };
    const first = render(<FestivalAnchorPanel {...props} />);
    const candidateButton = screen.getByRole("button", { name: /여름 강변 축제/ });

    fireEvent.click(candidateButton);
    await waitFor(() => expect(window.localStorage.getItem("tour-dna:anchor-event:project-1")).toBe("tourapi-festival-1"));
    expect(candidateButton).toHaveAttribute("aria-pressed", "true");

    first.unmount();
    render(<FestivalAnchorPanel {...props} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /여름 강변 축제/ })).toHaveAttribute("aria-pressed", "true"));
  });
});
