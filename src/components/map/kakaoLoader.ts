export interface KakaoLatLng {
  new (lat: number, lng: number): unknown;
}
export interface KakaoBoundsInstance {
  extend: (latlng: unknown) => void;
}
export interface KakaoLatLngBounds {
  new (): KakaoBoundsInstance;
}
export interface KakaoMapInstance {
  setBounds: (bounds: KakaoBoundsInstance) => void;
}
export interface KakaoMap {
  new (container: HTMLElement, options: { center: unknown; level: number }): KakaoMapInstance;
}
export interface KakaoMarker {
  new (options: { position: unknown; map: unknown; zIndex?: number }): unknown;
}
export interface KakaoInfoWindow {
  new (options: { content: string }): { open: (map: unknown, marker: unknown) => void };
}
export interface KakaoPolylineInstance {
  setMap: (map: unknown) => void;
}
export interface KakaoPolyline {
  new (options: {
    path: unknown[];
    strokeWeight?: number;
    strokeColor?: string;
    strokeOpacity?: number;
    strokeStyle?: string;
    zIndex?: number;
  }): KakaoPolylineInstance;
}
export interface KakaoMapsNamespace {
  load: (cb: () => void) => void;
  LatLng: KakaoLatLng;
  LatLngBounds: KakaoLatLngBounds;
  Map: KakaoMap;
  Marker: KakaoMarker;
  InfoWindow: KakaoInfoWindow;
  Polyline: KakaoPolyline;
  event: { addListener: (target: unknown, type: string, handler: () => void) => void };
}
declare global {
  interface Window {
    kakao?: { maps: KakaoMapsNamespace };
  }
}

/** 스크립트 자체는 정상 로드됐지만(네트워크 오류 없음) `kakao.maps.load()` 콜백이 끝내 오지 않는
 * 경우를 위한 상한 대기 시간(2026-08-11) — Kakao Developers Console에 현재 접속 도메인(Web 플랫폼)이
 * 등록돼 있지 않으면 SDK가 별도 에러 이벤트 없이 콜백만 영원히 호출하지 않는 경우가 있어, 기존
 * 코드에서는 이 경우 지도 영역이 빈 채로 무한 대기했다. onError로 넘어가면 기존 FallbackList/
 * FallbackNote가 이미 "카카오 JavaScript SDK 도메인 등록 여부 확인 필요" 안내를 보여주므로, 여기서는
 * 그 경로를 확실히 타도록 시간 제한만 추가한다. */
const SDK_READY_TIMEOUT_MS = 8000;

/**
 * 카카오맵 JS SDK를 로드한다(이미 로드돼 있으면 바로 onReady). 스크립트 태그는 페이지에 한 번만
 * 추가하고, 같은 페이지에 지도 컴포넌트가 여러 개 있어도 이후 호출은 기존 태그의 load 이벤트에
 * 콜백만 추가한다(MapOrFallback/CourseMap이 공유).
 */
export function loadKakaoMapsSdk(appkey: string, onReady: () => void, onError: () => void): void {
  let settled = false;
  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    onError();
  }, SDK_READY_TIMEOUT_MS);
  const finishReady = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    onReady();
  };
  const finishError = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    onError();
  };

  if (window.kakao?.maps) {
    window.kakao.maps.load(finishReady);
    return;
  }

  const scriptId = "kakao-map-sdk";
  let script = document.getElementById(scriptId) as HTMLScriptElement | null;
  if (!script) {
    script = document.createElement("script");
    script.id = scriptId;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appkey}&autoload=false`;
    script.onerror = finishError;
    script.addEventListener("load", () => window.kakao?.maps.load(finishReady));
    document.head.appendChild(script);
  } else {
    script.addEventListener("load", () => window.kakao?.maps.load(finishReady));
  }
}
