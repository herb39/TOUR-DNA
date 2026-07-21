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
  new (options: { position: unknown; map: unknown }): unknown;
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

/**
 * 카카오맵 JS SDK를 로드한다(이미 로드돼 있으면 바로 onReady). 스크립트 태그는 페이지에 한 번만
 * 추가하고, 같은 페이지에 지도 컴포넌트가 여러 개 있어도 이후 호출은 기존 태그의 load 이벤트에
 * 콜백만 추가한다(MapOrFallback/CourseMap이 공유).
 */
export function loadKakaoMapsSdk(appkey: string, onReady: () => void, onError: () => void): void {
  if (window.kakao?.maps) {
    window.kakao.maps.load(onReady);
    return;
  }

  const scriptId = "kakao-map-sdk";
  let script = document.getElementById(scriptId) as HTMLScriptElement | null;
  if (!script) {
    script = document.createElement("script");
    script.id = scriptId;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appkey}&autoload=false`;
    script.onerror = onError;
    script.addEventListener("load", () => window.kakao?.maps.load(onReady));
    document.head.appendChild(script);
  } else {
    script.addEventListener("load", () => window.kakao?.maps.load(onReady));
  }
}
