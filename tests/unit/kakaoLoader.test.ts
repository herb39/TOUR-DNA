// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadKakaoMapsSdk } from "@/components/map/kakaoLoader";

describe("loadKakaoMapsSdk", () => {
  beforeEach(() => {
    delete (window as { kakao?: unknown }).kakao;
    document.getElementById("kakao-map-sdk")?.remove();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as { kakao?: unknown }).kakao;
    document.getElementById("kakao-map-sdk")?.remove();
  });

  it("window.kakao.maps가 이미 있으면 즉시 onReady를 부른다(스크립트 태그를 새로 만들지 않음)", () => {
    (window as unknown as { kakao: unknown }).kakao = { maps: { load: (cb: () => void) => cb() } };
    const onReady = vi.fn();
    const onError = vi.fn();
    loadKakaoMapsSdk("key", onReady, onError);
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(document.getElementById("kakao-map-sdk")).toBeNull();
  });

  it("스크립트가 없으면 정확한 src로 새 스크립트 태그를 한 번만 만든다", () => {
    loadKakaoMapsSdk("my-app-key", vi.fn(), vi.fn());
    const script = document.getElementById("kakao-map-sdk") as HTMLScriptElement;
    expect(script).not.toBeNull();
    expect(script.src).toContain("https://dapi.kakao.com/v2/maps/sdk.js?appkey=my-app-key&autoload=false");
  });

  it("스크립트 load 이벤트 후 kakao.maps.load 콜백이 오면 onReady를 부른다", () => {
    loadKakaoMapsSdk("key", vi.fn(), vi.fn());
    const script = document.getElementById("kakao-map-sdk") as HTMLScriptElement;
    (window as unknown as { kakao: unknown }).kakao = { maps: { load: (cb: () => void) => cb() } };
    const onReady = vi.fn();
    // 두 번째 호출(예: CourseMap이 같은 페이지에서 또 부르는 경우)은 이미 있는 태그의 load 이벤트를 공유한다.
    loadKakaoMapsSdk("key", onReady, vi.fn());
    script.dispatchEvent(new Event("load"));
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("script.onerror가 발생하면 onError를 부르고, 이후 타임아웃이 지나도 다시 부르지 않는다", () => {
    const onReady = vi.fn();
    const onError = vi.fn();
    loadKakaoMapsSdk("key", onReady, onError);
    const script = document.getElementById("kakao-map-sdk") as HTMLScriptElement;
    script.onerror?.(new Event("error"));
    expect(onError).toHaveBeenCalledTimes(1);
    vi.runAllTimers();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onReady).not.toHaveBeenCalled();
  });

  it(
    "스크립트는 로드됐지만(네트워크 오류 없음) kakao.maps.load 콜백이 끝내 오지 않으면(도메인 미등록 등) " +
      "타임아웃 후 onError로 대체한다(2026-08-11) — 이전에는 무한 대기했다",
    () => {
      const onReady = vi.fn();
      const onError = vi.fn();
      loadKakaoMapsSdk("key", onReady, onError);
      // script.onerror도, load 이벤트도, kakao.maps.load 콜백도 전혀 오지 않는 상황을 재현한다.
      expect(onError).not.toHaveBeenCalled();
      vi.runAllTimers();
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onReady).not.toHaveBeenCalled();
    },
  );

  it("타임아웃 전에 onReady가 이미 호출됐으면 타임아웃이 지나도 onError를 부르지 않는다", () => {
    (window as unknown as { kakao: unknown }).kakao = { maps: { load: (cb: () => void) => cb() } };
    const onReady = vi.fn();
    const onError = vi.fn();
    loadKakaoMapsSdk("key", onReady, onError);
    expect(onReady).toHaveBeenCalledTimes(1);
    vi.runAllTimers();
    expect(onError).not.toHaveBeenCalled();
  });
});
