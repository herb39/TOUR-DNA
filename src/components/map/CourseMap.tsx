"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadKakaoMapsSdk } from "./kakaoLoader";
import { fetchPlanRouteGeometryAction } from "@/app/projects/[id]/plan/actions";
import type { TransportCode } from "@/lib/domain/planBuilder";

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

interface LatLng {
  lat: number;
  lng: number;
}

function hasCoords(item: CourseMapItem): item is CourseMapItem & { lat: number; lng: number } {
  return Number.isFinite(item.lat) && Number.isFinite(item.lng);
}

function edgeKey(fromPoiId: string, toPoiId: string): string {
  return `${fromPoiId}::${toPoiId}`;
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

/**
 * 일자·시간대별 코스를 카카오맵에 순서대로 마커+동선(Polyline)으로 표시한다. 날짜가 여러 개면 날짜별
 * 탭으로 전환한다.
 *
 * PRIVATE_VEHICLE이고 `projectId`가 있으면(2026-08-06, Phase 12 후속) 마운트 후 실제 도로 경로 좌표를
 * 서버 액션(`fetchPlanRouteGeometryAction`)으로 일시적으로 조회해, 구간별로 실제 도로 Polyline을 덧그린다
 * — 이 좌표는 어디에도 저장하지 않고(DB write 없음) 이 컴포넌트의 React state에만 잠깐 머문다. 조회
 * 전이거나 실패한 구간은 항상 기존 방문 순서 직선(점선·저강조)으로 그대로 표시된다 — 지도 자체가
 * 막히거나 실행안 다른 내용의 렌더링을 지연시키지 않는다(이 조회는 마운트 이후 별도로 진행된다).
 */
export function CourseMap({
  days,
  kakaoKey,
  projectId,
  transport,
}: {
  days: CourseMapDay[];
  kakaoKey?: string;
  /** 있으면 PRIVATE_VEHICLE일 때 실제 도로 경로를 조회한다. 없으면(인쇄 화면 등) 항상 직선 fallback만 그린다. */
  projectId?: string;
  transport?: TransportCode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapFailed, setMapFailed] = useState(false);
  const [geometryByEdge, setGeometryByEdge] = useState<Map<string, LatLng[]> | null>(null);

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

  const isPrivateVehicle = transport === "PRIVATE_VEHICLE";

  // 실제 도로 경로 조회(2026-08-06) — 지도 마운트/일정 변경과 독립적으로 한 번만 시도한다. 실행안
  // 내용은 이 조회와 무관하게 이미 렌더링돼 있으므로, 여기서 시간이 걸리거나 실패해도 지도의 마커·직선
  // 연결선은 그대로 보인다(막힘 없음). geometryByEdge가 null → 아직 조회 전(또는 대상 아님), 값이 있으면
  // 해당 구간만 실제 경로로 대체한다.
  useEffect(() => {
    if (!isPrivateVehicle || !projectId) return; // 기본값(null)이라 별도로 되돌릴 필요가 없다.
    let cancelled = false;
    fetchPlanRouteGeometryAction(projectId)
      .then((result) => {
        if (cancelled) return;
        const map = new Map<string, LatLng[]>();
        for (const seg of result.segments) {
          if (seg.source === "LIVE_ROUTE" && seg.path.length >= 2) {
            map.set(edgeKey(seg.fromPoiId, seg.toPoiId), seg.path);
          }
        }
        setGeometryByEdge(map);
      })
      .catch(() => {
        if (!cancelled) setGeometryByEdge(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [isPrivateVehicle, projectId]);

  // 오늘 보여줄 날짜의 각 구간이 실제 도로 경로인지 직선 fallback인지 — 지도(imperative kakao 호출)와
  // 아래 범례 문구(선언적 JSX)가 같은 판정을 쓰도록 한 곳에서만 계산한다.
  const currentDaySegmentSources = useMemo(() => {
    if (!currentDay) return [];
    const sources: ("LIVE_ROUTE" | "FALLBACK")[] = [];
    for (let i = 1; i < currentDay.items.length; i++) {
      const key = edgeKey(currentDay.items[i - 1].poiId, currentDay.items[i].poiId);
      sources.push(geometryByEdge?.has(key) ? "LIVE_ROUTE" : "FALLBACK");
    }
    return sources;
  }, [currentDay, geometryByEdge]);

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

        const positions = items.map((item, i) => {
          const position = new kakao.maps.LatLng(item.lat, item.lng);
          bounds.extend(position);
          const marker = new kakao.maps.Marker({ position, map });
          const info = new kakao.maps.InfoWindow({
            content: `<div style="padding:4px;font-size:12px;">${i + 1}. ${item.timeSlot} ${item.poiName}</div>`,
          });
          kakao.maps.event.addListener(marker, "click", () => info.open(map, marker));
          return position;
        });

        for (let i = 1; i < items.length; i++) {
          const key = edgeKey(items[i - 1].poiId, items[i].poiId);
          const livePath = geometryByEdge?.get(key);
          if (livePath && livePath.length >= 2) {
            const kakaoPath = livePath.map((p) => new kakao.maps.LatLng(p.lat, p.lng));
            kakaoPath.forEach((pos) => bounds.extend(pos));
            new kakao.maps.Polyline({
              path: kakaoPath,
              strokeWeight: 4,
              strokeColor: "#0f172a",
              strokeOpacity: 0.85,
              strokeStyle: "solid",
            }).setMap(map);
            continue;
          }
          // 카카오모빌리티 실제 도로 경로(길찾기 API)의 거리·시간은 이미 위 일정 목록에 반영돼 있다.
          // 이 구간은 실제 geometry를 아직 못 받았거나(조회 중·실패) PRIVATE_VEHICLE이 아니라 방문
          // 순서를 잇는 직선일 뿐이다 — 점선·저강조 스타일로 실제 도로선과 구분한다.
          new kakao.maps.Polyline({
            path: [positions[i - 1], positions[i]],
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
  }, [kakaoKey, currentDay, geometryByEdge]);

  if (!kakaoKey) return <FallbackNote reason="NO_KEY" />;
  if (mapFailed) return <FallbackNote reason="LOAD_FAILED" />;
  if (selectableDays.length === 0) return <FallbackNote reason="NO_COORDS" />;

  const hasLiveSegment = currentDaySegmentSources.includes("LIVE_ROUTE");
  const hasFallbackSegment = currentDaySegmentSources.includes("FALLBACK");

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
      <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
        {isPrivateVehicle && hasLiveSegment ? (
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block h-0 w-4 border-t-2 border-slate-900" />
            <span>실제 도로 경로</span>
          </span>
        ) : null}
        {!isPrivateVehicle || hasFallbackSegment ? (
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block h-0 w-4 border-t-2 border-dashed border-slate-400" />
            <span>{isPrivateVehicle ? "경로 조회 실패 · 장소 연결선" : "방문 순서 연결선"}</span>
          </span>
        ) : null}
      </div>
      {isPrivateVehicle && hasLiveSegment && !hasFallbackSegment ? (
        <p className="mt-1 text-[11px] text-slate-400">
          지도 선은 카카오모빌리티 실제 도로 경로입니다. 거리·시간은 위 일정 목록의 값을 확인해주세요.
        </p>
      ) : isPrivateVehicle && hasLiveSegment && hasFallbackSegment ? (
        <p className="mt-1 text-[11px] text-slate-400">
          일부 구간은 실제 도로 경로, 일부는 경로 조회에 실패해 방문 순서 연결선(점선)으로 표시됩니다.
          거리·시간은 위 일정 목록의 값을 확인해주세요.
        </p>
      ) : (
        <p className="mt-1 text-[11px] text-slate-400">
          지도 선은 실제 도로 경로가 아닌 방문 순서 연결선입니다. 거리·시간은 위 일정 목록의 &quot;실제 도로
          기준&quot;/&quot;직선거리 기반 추정&quot; 값을 확인해주세요.
        </p>
      )}
    </div>
  );
}
