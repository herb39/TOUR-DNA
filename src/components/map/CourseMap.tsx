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

        if (path.length > 1) {
          new kakao.maps.Polyline({
            path,
            strokeWeight: 3,
            strokeColor: "#0f172a",
            strokeOpacity: 0.8,
            strokeStyle: "solid",
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
    </div>
  );
}
