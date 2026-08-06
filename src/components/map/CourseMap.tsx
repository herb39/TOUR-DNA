"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadKakaoMapsSdk } from "./kakaoLoader";

export interface CourseMapItem {
  poiId: string;
  poiName: string;
  timeSlot: string;
  lat?: number;
  lng?: number;
}

export interface CourseMapDay {
  dayIndex: number;
  items: CourseMapItem[];
}

function hasCoords(item: CourseMapItem): item is CourseMapItem & { lat: number; lng: number } {
  return Number.isFinite(item.lat) && Number.isFinite(item.lng);
}

function FallbackNote({ reason }: { reason: "NO_KEY" | "LOAD_FAILED" | "NO_COORDS" }) {
  const message =
    reason === "NO_KEY"
      ? "지도 API 키가 설정되지 않아 동선을 표시할 수 없습니다."
      : reason === "LOAD_FAILED"
        ? "지도를 불러오지 못했습니다(카카오 JavaScript SDK 도메인 등록 여부 확인 필요)."
        : "좌표 정보가 있는 장소가 없어 동선을 표시할 수 없습니다.";
  return <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">{message}</p>;
}

/** 일자·시간대별 코스를 카카오맵에 순서대로 마커+동선(Polyline)으로 표시한다. 날짜가 여러 개면 날짜별 탭으로 전환한다. */
export function CourseMap({ days, kakaoKey }: { days: CourseMapDay[]; kakaoKey?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapFailed, setMapFailed] = useState(false);

  const selectableDays = useMemo(
    () =>
      days
        .map((d) => ({ dayIndex: d.dayIndex, items: d.items.filter(hasCoords) }))
        .filter((d) => d.items.length > 0),
    [days],
  );

  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(null);

  // 사용자가 명시적으로 고른 날짜가 있고 아직 유효하면(좌표 있는 장소가 남아있으면) 그대로 쓰고,
  // 없으면(초기 렌더, 혹은 항목 삭제로 선택했던 날짜에 좌표 있는 곳이 사라진 경우) 첫 날짜로 대체한다.
  // effect로 state를 되돌리는 대신 렌더 중 파생값으로 계산한다.
  const currentDay =
    (selectedDayIndex !== null ? selectableDays.find((d) => d.dayIndex === selectedDayIndex) : undefined) ??
    selectableDays[0];

  useEffect(() => {
    if (!kakaoKey || !currentDay || currentDay.items.length === 0) return;

    loadKakaoMapsSdk(
      kakaoKey,
      () => {
        const kakao = window.kakao;
        if (!kakao?.maps || !containerRef.current) {
          setMapFailed(true);
          return;
        }
        const items = currentDay.items;
        const bounds = new kakao.maps.LatLngBounds();
        const map = new kakao.maps.Map(containerRef.current, {
          center: new kakao.maps.LatLng(items[0].lat, items[0].lng),
          level: 7,
        });

        const path = items.map((item, i) => {
          const position = new kakao.maps.LatLng(item.lat, item.lng);
          bounds.extend(position);
          const marker = new kakao.maps.Marker({ position, map });
          const info = new kakao.maps.InfoWindow({
            content: `<div style="padding:4px;font-size:12px;">${i + 1}. ${item.timeSlot} ${item.poiName}</div>`,
          });
          kakao.maps.event.addListener(marker, "click", () => info.open(map, marker));
          return position;
        });

        // 카카오모빌리티 실제 도로 경로(길찾기 API)의 거리·시간은 이미 위 일정 목록에 반영돼 있지만,
        // 이 Polyline은 그 실제 도로 geometry가 아니라 방문 순서를 잇는 직선이다(2026-08-06 조사 결과,
        // docs/route-api-status.md 참고 — 실제 경로 좌표 자체는 카카오 API로 확보 가능하나, 그 결과를
        // 저장·재사용해도 되는지 카카오 측 이용약관이 아직 불명확해 이번에는 구현하지 않는다). 점선·낮은
        // 강조 스타일로 바꿔 "실제 도로 기준" 거리·시간 배지와 혼동하지 않게 한다.
        if (path.length > 1) {
          new kakao.maps.Polyline({
            path,
            strokeWeight: 2,
            strokeColor: "#94a3b8",
            strokeOpacity: 0.7,
            strokeStyle: "shortdash",
          }).setMap(map);
        }

        map.setBounds(bounds);
      },
      () => setMapFailed(true),
    );
  }, [kakaoKey, currentDay]);

  if (!kakaoKey) return <FallbackNote reason="NO_KEY" />;
  if (mapFailed) return <FallbackNote reason="LOAD_FAILED" />;
  if (selectableDays.length === 0) return <FallbackNote reason="NO_COORDS" />;

  return (
    <div>
      {selectableDays.length > 1 ? (
        <div className="no-print mb-2 flex flex-wrap gap-1">
          {selectableDays.map((d) => (
            <button
              key={d.dayIndex}
              type="button"
              onClick={() => setSelectedDayIndex(d.dayIndex)}
              className={`cursor-pointer rounded px-2 py-1 text-xs ${
                d.dayIndex === currentDay?.dayIndex
                  ? "bg-slate-900 text-white"
                  : "border border-slate-300 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {d.dayIndex}일차
            </button>
          ))}
        </div>
      ) : null}
      <div ref={containerRef} data-testid="course-map-container" className="h-80 w-full rounded-lg border border-slate-200" />
      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
        <span aria-hidden="true" className="inline-block h-0 w-4 border-t-2 border-dashed border-slate-400" />
        <span>방문 순서 연결선</span>
      </div>
      <p className="mt-1 text-[11px] text-slate-400">
        지도 선은 실제 도로 경로가 아닌 방문 순서 연결선입니다. 거리·시간은 위 일정 목록의 &quot;실제 도로
        기준&quot;/&quot;직선거리 기반 추정&quot; 값을 확인해주세요.
      </p>
    </div>
  );
}
