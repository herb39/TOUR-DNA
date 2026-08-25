"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

const EXPAND_DURATION_MS = 220;

function prefersReducedMotion() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

function requestNextFrame(callback: () => void) {
  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    return window.requestAnimationFrame(callback);
  }
  return window.setTimeout(callback, 0);
}

export function AnimatedDetails({
  summary,
  children,
  className,
  summaryClassName,
  contentClassName,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
}: {
  summary: ReactNode;
  children: ReactNode;
  className?: string;
  summaryClassName?: string;
  contentClassName?: string;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const isControlled = controlledOpen !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const targetOpen = isControlled ? controlledOpen : uncontrolledOpen;
  const [visualOpen, setVisualOpen] = useState(targetOpen);
  const [isClosing, setIsClosing] = useState(false);
  const [height, setHeight] = useState<number | "auto">(targetOpen ? "auto" : 0);
  const contentRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const contentId = useId();

  const clearPending = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (frameRef.current !== null) {
      if (typeof window.cancelAnimationFrame === "function") {
        window.cancelAnimationFrame(frameRef.current);
      }
      window.clearTimeout(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  const finishOpen = useCallback(() => {
    setHeight("auto");
    setIsClosing(false);
    timeoutRef.current = null;
  }, []);

  const finishClose = useCallback(() => {
    setIsClosing(false);
    setHeight(0);
    timeoutRef.current = null;
  }, []);

  const transitionTo = useCallback(
    (nextOpen: boolean) => {
      clearPending();

      if (prefersReducedMotion()) {
        setVisualOpen(nextOpen);
        setIsClosing(false);
        setHeight(nextOpen ? "auto" : 0);
        return;
      }

      const content = contentRef.current;
      const measuredHeight = content?.scrollHeight ?? 0;

      if (nextOpen) {
        setVisualOpen(true);
        setIsClosing(false);
        setHeight(0);
        frameRef.current = requestNextFrame(() => {
          frameRef.current = null;
          setHeight(contentRef.current?.scrollHeight ?? measuredHeight);
          timeoutRef.current = window.setTimeout(finishOpen, EXPAND_DURATION_MS);
        });
        return;
      }

      const currentHeight = content?.getBoundingClientRect().height || measuredHeight;
      setVisualOpen(false);
      setIsClosing(true);
      setHeight(currentHeight);
      frameRef.current = requestNextFrame(() => {
        frameRef.current = null;
        setHeight(0);
        timeoutRef.current = window.setTimeout(finishClose, EXPAND_DURATION_MS);
      });
    },
    [clearPending, finishClose, finishOpen],
  );

  const targetOpenRef = useRef(targetOpen);

  useEffect(() => {
    if (!isControlled || targetOpenRef.current === targetOpen) return;
    targetOpenRef.current = targetOpen;
    transitionTo(targetOpen);
  }, [isControlled, targetOpen, transitionTo]);

  useEffect(() => clearPending, [clearPending]);

  function toggleSummary() {
    const nextOpen = isClosing ? true : !visualOpen;

    if (isControlled) {
      onOpenChange?.(nextOpen);
      return;
    }

    setUncontrolledOpen(nextOpen);
    transitionTo(nextOpen);
  }

  function handleSummaryClick(event: MouseEvent<HTMLElement>) {
    event.preventDefault();
    toggleSummary();
  }

  function handleSummaryKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") return;
    event.preventDefault();
    toggleSummary();
  }

  return (
    <details className={className} open={visualOpen || isClosing}>
      <summary
        className={summaryClassName}
        aria-controls={contentId}
        aria-expanded={visualOpen && !isClosing}
        role="button"
        onClick={handleSummaryClick}
        onKeyDown={handleSummaryKeyDown}
      >
        {summary}
      </summary>
      <div
        id={contentId}
        ref={contentRef}
        className={`tour-dna-expandable-content${contentClassName ? ` ${contentClassName}` : ""}`}
        data-open={visualOpen && !isClosing ? "true" : "false"}
        style={{ height: height === "auto" ? "auto" : `${height}px` }}
      >
        {children}
      </div>
    </details>
  );
}
