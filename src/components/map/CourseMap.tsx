"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadKakaoMapsSdk } from "./kakaoLoader";
import { fetchPlanRouteGeometryAction } from "@/app/projects/[id]/plan/actions";

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

/** 실제 도로 형상을 따르는 이동 경로 강조색 — 슬레이트(검정에 가까운) 계열 대신 관광 서비스에 어울리는
 * 선명한 청록으로 바꿨다(2026-08-06 2차). 지도 배경(연녹색/베이지)·도로(노란색)·기본 마커(파란색)와
 * 모두 구분되면서 충분히 밝다. 흰색 외곽선(halo)을 먼저 그려 배경과의 대비를 한 번 더 확보한다. */
const ROUTE_COLOR = "#0d9488"; // teal-600
const ROUTE_HALO_COLOR = "#ffffff";

function hasCoords(item: CourseMapItem): item is CourseMapItem & { lat: number; lng: number } {
  return Number.isFinite(item.lat) && Number.isFinite(item.lng);
}

function edgeKey(fromPoiId: string, toPoiId: string): string {
  return `${fromPoiId}::${toPoiId}`;
}

/** 이동 경로선(halo+본선)을 그려 지도에 얹고, 생성된 Polyline들을 반환한다(2026-08-08) — 지도 생성
 * 시점과 경로 조회 완료 시점, 두 곳에서 공유해 그리는 방식을 하나로 유지한다. */
function drawRouteLines(
  kakao: NonNullable<Window["kakao"]>["maps"],
  map: unknown,
  positions: unknown[],
  items: CourseMapItem[],
  geometryByEdge: Map<string, LatLng[]> | null,
): { setMap: (map: unknown) => void }[] {
  const overlays: { setMap: (map: unknown) => void }[] = [];
  const bounds = new kakao.LatLngBounds();
  positions.forEach((p) => bounds.extend(p));

  for (let i = 1; i < items.length; i++) {
    const key = edgeKey(items[i - 1].poiId, items[i].poiId);
    const livePath = geometryByEdge?.get(key);
    const hasLivePath = livePath && livePath.length >= 2;
    const path = hasLivePath
      ? livePath.map((p) => new kakao.LatLng(p.lat, p.lng))
      : [positions[i - 1], positions[i]];
    path.forEach((pos) => bounds.extend(pos));

    // 배경과의 대비를 위한 흰색 외곽선(halo) — 실제 경로를 못 받은 구간은 살짝 더 옅게 표시해
    // 시각적으로만 구분하고(기술적 설명은 노출하지 않음) 지도 전체의 색감은 통일한다.
    const halo = new kakao.Polyline({
      path,
      strokeWeight: hasLivePath ? 9 : 6,
      strokeColor: ROUTE_HALO_COLOR,
      strokeOpacity: hasLivePath ? 0.55 : 0.45,
      strokeStyle: "solid",
      zIndex: 1,
    });
    halo.setMap(map);
    const main = new kakao.Polyline({
      path,
      strokeWeight: hasLivePath ? 6 : 4,
      strokeColor: ROUTE_COLOR,
      strokeOpacity: hasLivePath ? 0.9 : 0.75,
      strokeStyle: hasLivePath ? "solid" : "shortdash",
      zIndex: 2,
    });
    main.setMap(map);
    overlays.push(halo, main);
  }

  (map as { setBounds: (b: unknown) => void }).setBounds(bounds);
  return overlays;
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
 * 일자·시간대별 코스를 카카오맵에 순서대로 마커+이동 경로(Polyline)로 표시한다. 날짜가 여러 개면
 * 날짜별 탭으로 전환한다.
 *
 * 이동수단과 관계없이(2026-08-06 2차 — 이전에는 PRIVATE_VEHICLE만 대상) `projectId`가 있으면 마운트
 * 후 실제 도로 형상 좌표를 서버 액션(`fetchPlanRouteGeometryAction`)으로 일시적으로 조회해, 구간별로
 * 도로를 따라가는 이동 경로를 그린다 — 이 좌표는 어디에도 저장하지 않고(DB write 없음) 이 컴포넌트의
 * React state에만 잠깐 머문다. 아직 확보하지 못했거나(조회 중) 실패한 구간만 내부적으로 두 지점을
 * 직선으로 이어 대체한다 — 어느 경우든 화면에는 "실제 도로 경로"·"자동차 기준"·"조회 실패" 같은
 * 기술적 설명을 노출하지 않는다(이 구분은 서버 로그·테스트에서만 확인한다). 조회는 마운트 이후
 * 별도로 진행되어 지도나 실행안의 다른 내용 렌더링을 막지 않는다.
 */
export function CourseMap({
  days,
  kakaoKey,
  projectId,
}: {
  days: CourseMapDay[];
  kakaoKey?: string;
  /** 있으면 마운트 후 이동 경로를 조회한다. 없으면(인쇄 화면 등) 항상 장소를 직선으로 이어 표시한다. */
  projectId?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapFailed, setMapFailed] = useState(false);
  const [geometryByEdge, setGeometryByEdge] = useState<Map<string, LatLng[]> | null>(null);

  // 지도 인스턴스·마커 위치·현재 그려진 경로선(halo+본선)을 ref로 들고 있다가, 실제 경로 조회가
  // 뒤늦게 끝나도 지도 자체를 다시 만들지 않고 경로선만 지우고 새로 그린다(2026-08-08). 이전에는
  // geometryByEdge가 바뀔 때마다 kakao.maps.Map을 통째로 새로 생성해, 실제 경로가 늦게 도착하면 지도가
  // 다시 그려지는 순간 이전 지도의 fallback 점선이 잠깐 남아 있다가 확대/축소 시 깜빡여 보였다.
  const mapInstanceRef = useRef<unknown>(null);
  const positionsRef = useRef<unknown[]>([]);
  const routeOverlaysRef = useRef<{ setMap: (map: unknown) => void }[]>([]);
  // SDK 로딩이 비동기로 끝나는 경우(최초 스크립트 로딩) 지도 생성 콜백이 나중에 실행될 수 있어, 그
  // 시점에 최신 geometryByEdge를 읽기 위한 ref다(지도 생성 effect는 geometryByEdge를 의존성으로 두지
  // 않으므로 클로저가 오래된 값을 참조할 수 있다).
  const geometryRef = useRef<Map<string, LatLng[]> | null>(null);
  useEffect(() => {
    geometryRef.current = geometryByEdge;
  }, [geometryByEdge]);
  // React는 마운트 시 의존성 변화 여부와 무관하게 모든 effect를 한 번 실행하므로, 지도 생성 effect가
  // 이미 그린 최초 1회분을 경로선 갱신 effect가 중복으로 다시 그리지 않도록 막는 플래그다.
  const isFirstGeometryRun = useRef(true);

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

  // 이동 경로 조회(2026-08-06, 2026-08-06 2차: 이동수단 무관 전체 적용) — 지도 마운트/일정 변경과
  // 독립적으로 한 번만 시도한다. 실행안 내용은 이 조회와 무관하게 이미 렌더링돼 있으므로, 여기서
  // 시간이 걸리거나 실패해도 지도의 마커·직선 연결선은 그대로 보인다(막힘 없음). geometryByEdge가
  // null이면 아직 조회 전, 값이 있으면 해당 구간만 실제 경로로 대체한다.
  useEffect(() => {
    if (!projectId) return;
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
  }, [projectId]);

  // 지도 생성 + 마커 — 날짜(currentDay)나 키가 바뀔 때만 실행되어 지도를 새로 만든다(날짜 탭 전환 시
  // 이전 날짜의 오버레이가 남지 않도록 컨테이너를 초기화하는 기존 동작 유지). geometryByEdge는 여기서
  // 다루지 않는다 — 경로 조회가 끝나도 이 effect가 다시 돌아 지도를 재생성하지 않게 한다.
  useEffect(() => {
    mapInstanceRef.current = null;
    positionsRef.current = [];
    routeOverlaysRef.current = [];
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
        const map = new kakao.maps.Map(containerRef.current, {
          center: new kakao.maps.LatLng(items[0].lat, items[0].lng),
          level: 7,
        });

        const positions = items.map((item, i) => {
          const position = new kakao.maps.LatLng(item.lat, item.lng);
          const marker = new kakao.maps.Marker({ position, map, zIndex: 10 });
          const info = new kakao.maps.InfoWindow({
            content: `<div style="padding:4px;font-size:12px;">${i + 1}. ${item.timeSlot} ${item.poiName}</div>`,
          });
          kakao.maps.event.addListener(marker, "click", () => info.open(map, marker));
          return position;
        });

        mapInstanceRef.current = map;
        positionsRef.current = positions;
        // 지도를 만든 직후 그 시점까지 확보된 경로로 한 번 그린다(geometryRef는 최신값을 항상 반영).
        routeOverlaysRef.current = drawRouteLines(kakao.maps, map, positions, items, geometryRef.current);
      },
      () => setMapFailed(true),
    );
  }, [kakaoKey, currentDay]);

  // 이동 경로선 다시 그리기 — geometryByEdge(경로 조회 결과)가 바뀌면 지도는 그대로 두고 경로선만
  // 지운 뒤 새로 그린다(2026-08-08, 지도 재생성으로 인한 확대/축소 시 fallback 점선 깜빡임 수정). 지도
  // 생성 직후의 첫 그리기는 위 effect가 이미 처리하므로, 여기서는 이후에 오는 갱신만 다룬다 — React는
  // 마운트 시 deps와 무관하게 모든 effect를 한 번씩 실행하므로, 최초 1회는 isFirstGeometryRun로 건너뛴다.
  useEffect(() => {
    if (isFirstGeometryRun.current) {
      isFirstGeometryRun.current = false;
      return;
    }
    const kakao = window.kakao;
    const map = mapInstanceRef.current;
    if (!kakao?.maps || !map || !currentDay) return;

    routeOverlaysRef.current.forEach((overlay) => overlay.setMap(null));
    routeOverlaysRef.current = drawRouteLines(
      kakao.maps,
      map,
      positionsRef.current,
      currentDay.items,
      geometryByEdge,
    );
    // currentDay는 의도적으로 제외한다 — 날짜 전환은 위 지도 생성 effect가 처음부터 다시 그려 처리하고,
    // 여기서 또 반응하면 같은 경로선이 중복으로 그려진다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometryByEdge]);

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
      <p className="mt-1 text-[11px] text-slate-400">이동 경로 — 장소를 방문 순서대로 잇는 동선입니다.</p>
    </div>
  );
}
