"use client";

import { useEffect, useRef, useState } from "react";
import { loadKakaoMapsSdk } from "./kakaoLoader";

export interface MapPoi {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

function FallbackList({ pois, reason }: { pois: MapPoi[]; reason: "NO_KEY" | "LOAD_FAILED" }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="mb-3 text-xs text-slate-500">
        {reason === "NO_KEY"
          ? "지도 API 키가 설정되지 않아 좌표·주소 목록으로 대체 표시합니다."
          : "지도를 불러오지 못해(카카오 JavaScript SDK 도메인 등록 여부 확인 필요) 좌표·주소 목록으로 대체 표시합니다."}
      </p>
      <ol className="space-y-2 text-sm">
        {pois.map((p, i) => (
          <li key={p.id} className="flex items-start gap-2">
            <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-slate-900 text-[11px] font-medium text-white">
              {i + 1}
            </span>
            <div>
              <p className="font-medium text-slate-800">{p.name}</p>
              <p className="text-xs text-slate-500">
                {p.address} ({p.lat.toFixed(5)}, {p.lng.toFixed(5)})
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function MapOrFallback({ pois, kakaoKey }: { pois: MapPoi[]; kakaoKey?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapFailed, setMapFailed] = useState(false);

  useEffect(() => {
    if (!kakaoKey || pois.length === 0) return;

    loadKakaoMapsSdk(
      kakaoKey,
      () => {
        const kakao = window.kakao;
        if (!kakao?.maps || !containerRef.current) {
          setMapFailed(true);
          return;
        }
        const center = new kakao.maps.LatLng(pois[0].lat, pois[0].lng);
        const map = new kakao.maps.Map(containerRef.current, { center, level: 6 });
        pois.forEach((p, i) => {
          const marker = new kakao.maps.Marker({ position: new kakao.maps.LatLng(p.lat, p.lng), map });
          const info = new kakao.maps.InfoWindow({
            content: `<div style="padding:4px;font-size:12px;">${i + 1}. ${p.name}</div>`,
          });
          kakao.maps.event.addListener(marker, "click", () => info.open(map, marker));
        });
      },
      () => setMapFailed(true),
    );
  }, [kakaoKey, pois]);

  if (!kakaoKey) {
    return <FallbackList pois={pois} reason="NO_KEY" />;
  }
  if (mapFailed) {
    return <FallbackList pois={pois} reason="LOAD_FAILED" />;
  }

  return <div ref={containerRef} data-testid="kakao-map-container" className="h-80 w-full rounded-lg border border-slate-200" />;
}
