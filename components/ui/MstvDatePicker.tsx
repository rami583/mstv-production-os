"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { uiMotion, uiMotionClasses } from "@/lib/ui-motion";
import { cn } from "@/lib/utils";

type MstvDatePickerProps = {
  selectedDate: string;
  onClose: () => void;
  onSelectDate: (date: string) => Promise<void> | void;
  confirmationTitle?: string;
  allowSelectingCurrentDate?: boolean;
  formatFullDate?: (dateKey: string) => string;
  getUserFacingErrorMessage?: (error: unknown, fallback?: string) => string;
};

type PickerDay = {
  dateKey: string;
  day: number;
};

type PickerMonthData = {
  monthTitle: string;
  year: number;
  leadingEmptyDays: number;
  trailingEmptyDays: number;
  calendarDays: PickerDay[];
};

const pickerPageGap = 18;
const pickerTransitionMs = 360;
const pickerTransitionEasing = uiMotion.easing.standard;
const pickerSwipeThresholdRatio = 0.18;
const pickerSwipeThresholdMin = 58;
const pickerSwipeThresholdMax = 124;
const monthNames = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];
const weekdays = ["L", "M", "M", "J", "V", "S", "D"];
const modalBackdropClassName = "fixed inset-0 z-[70] flex bg-black/35";
const modalPanelClassName = "rounded-2xl bg-white shadow-sm shadow-black/5";
const calendarArrowClassName =
  "flex h-9 w-9 items-center justify-center rounded-full text-base text-[#bb2720] transition hover:bg-[#bb2720]/[0.08] disabled:cursor-not-allowed disabled:text-neutral-300 disabled:hover:bg-transparent";

function padNumber(value: number) {
  return String(value).padStart(2, "0");
}

function formatPickerDateKey(date: Date) {
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
}

function getPickerMonthData(month: Date): PickerMonthData {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const firstDay = new Date(year, monthIndex, 1).getDay();
  const leadingEmptyDays = (firstDay + 6) % 7;
  const calendarDays = Array.from({ length: daysInMonth }, (_, index) => {
    const date = new Date(year, monthIndex, index + 1);
    return {
      dateKey: formatPickerDateKey(date),
      day: index + 1,
    };
  });
  const trailingEmptyDays = (7 - ((leadingEmptyDays + daysInMonth) % 7)) % 7;

  return {
    monthTitle: monthNames[monthIndex],
    year,
    leadingEmptyDays,
    trailingEmptyDays,
    calendarDays,
  };
}

function getPickerSwipePageStep(viewportWidth: number) {
  return viewportWidth + pickerPageGap;
}

function getPickerSwipeThreshold(viewportWidth: number) {
  return Math.min(pickerSwipeThresholdMax, Math.max(pickerSwipeThresholdMin, viewportWidth * pickerSwipeThresholdRatio));
}

function defaultFormatFullDate(dateKey: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${dateKey}T12:00:00`));
}

function getDefaultUserFacingErrorMessage(error: unknown, fallback = "Une erreur est survenue.") {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

function useEscapeToClose(onClose: () => void) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
}

export function MstvDatePicker({
  selectedDate,
  onClose,
  onSelectDate,
  confirmationTitle,
  allowSelectingCurrentDate = false,
  formatFullDate = defaultFormatFullDate,
  getUserFacingErrorMessage = getDefaultUserFacingErrorMessage,
}: MstvDatePickerProps) {
  const [pickerMonth, setPickerMonth] = useState(() => new Date(`${selectedDate}T12:00:00`));
  const [pendingDate, setPendingDate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pickerSwipeStartRef = useRef<{ pointerId: number; x: number; y: number; axis: "horizontal" | "vertical" | null } | null>(null);
  const pickerPagerRef = useRef<HTMLDivElement | null>(null);
  const pickerTransitioningRef = useRef(false);
  const pickerTransitionTimeoutRef = useRef<number | null>(null);
  const suppressPickerClickRef = useRef(false);
  const [pickerPagerOffset, setPickerPagerOffset] = useState(0);
  const [pickerTransitionEnabled, setPickerTransitionEnabled] = useState(false);
  const [pickerAnimatingDirection, setPickerAnimatingDirection] = useState<-1 | 1 | null>(null);
  const monthData = useMemo(() => getPickerMonthData(pickerMonth), [pickerMonth]);
  const previousMonthData = useMemo(() => getPickerMonthData(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() - 1, 1)), [pickerMonth]);
  const nextMonthData = useMemo(() => getPickerMonthData(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() + 1, 1)), [pickerMonth]);

  useEffect(() => {
    return () => {
      if (pickerTransitionTimeoutRef.current) {
        window.clearTimeout(pickerTransitionTimeoutRef.current);
      }
    };
  }, []);

  useEscapeToClose(onClose);

  function selectDate(dateKey: string) {
    if (dateKey === selectedDate && !allowSelectingCurrentDate) {
      onClose();
      return;
    }

    if (!confirmationTitle) {
      void applyDate(dateKey);
      return;
    }

    setPendingDate(dateKey);
    setError(null);
  }

  async function applyDate(dateKey: string) {
    setSaving(true);
    setError(null);

    try {
      await onSelectDate(dateKey);
    } catch (saveError) {
      setError(getUserFacingErrorMessage(saveError, "Impossible de modifier la date."));
      setSaving(false);
    }
  }

  async function confirmDateChange() {
    if (!pendingDate) return;
    await applyDate(pendingDate);
  }

  function changePickerMonth(delta: -1 | 1) {
    if (saving || pickerTransitioningRef.current) return;

    const viewportWidth = pickerPagerRef.current?.clientWidth ?? 0;
    const pageStep = getPickerSwipePageStep(viewportWidth);
    pickerTransitioningRef.current = true;
    pickerSwipeStartRef.current = null;
    setPickerTransitionEnabled(true);
    setPickerAnimatingDirection(delta);
    setPickerPagerOffset(delta === 1 ? -pageStep : pageStep);

    if (pickerTransitionTimeoutRef.current) {
      window.clearTimeout(pickerTransitionTimeoutRef.current);
    }

    pickerTransitionTimeoutRef.current = window.setTimeout(() => {
      setPickerTransitionEnabled(false);
      setPickerMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
      setPickerAnimatingDirection(null);
      setPickerPagerOffset(0);

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          pickerTransitioningRef.current = false;
          pickerTransitionTimeoutRef.current = null;
        });
      });
    }, pickerTransitionMs);
  }

  function handlePickerSwipePointerDown(pointerEvent: ReactPointerEvent<HTMLDivElement>) {
    if (saving || pendingDate || pointerEvent.pointerType === "mouse" || pickerTransitioningRef.current) return;

    pickerSwipeStartRef.current = {
      pointerId: pointerEvent.pointerId,
      x: pointerEvent.clientX,
      y: pointerEvent.clientY,
      axis: null,
    };
    setPickerTransitionEnabled(false);
    setPickerPagerOffset(0);
    pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
  }

  function handlePickerSwipePointerMove(pointerEvent: ReactPointerEvent<HTMLDivElement>) {
    if (pickerTransitioningRef.current) return;

    const swipeStart = pickerSwipeStartRef.current;
    if (!swipeStart || swipeStart.pointerId !== pointerEvent.pointerId) return;

    const deltaX = pointerEvent.clientX - swipeStart.x;
    const deltaY = pointerEvent.clientY - swipeStart.y;

    if (!swipeStart.axis && Math.max(Math.abs(deltaX), Math.abs(deltaY)) > 8) {
      swipeStart.axis = Math.abs(deltaX) > Math.abs(deltaY) ? "horizontal" : "vertical";
    }

    if (swipeStart.axis === "horizontal") {
      suppressPickerClickRef.current = true;
      pointerEvent.preventDefault();
      const viewportWidth = pickerPagerRef.current?.clientWidth ?? pointerEvent.currentTarget.clientWidth;
      const pageStep = getPickerSwipePageStep(viewportWidth);
      setPickerPagerOffset(Math.max(-pageStep, Math.min(pageStep, deltaX)));
    }
  }

  function handlePickerSwipePointerUp(pointerEvent: ReactPointerEvent<HTMLDivElement>) {
    if (pickerTransitioningRef.current) return;

    const swipeStart = pickerSwipeStartRef.current;
    if (!swipeStart || swipeStart.pointerId !== pointerEvent.pointerId) return;

    const deltaX = pointerEvent.clientX - swipeStart.x;
    const deltaY = pointerEvent.clientY - swipeStart.y;
    const viewportWidth = pickerPagerRef.current?.clientWidth ?? pointerEvent.currentTarget.clientWidth;
    const swipeThreshold = getPickerSwipeThreshold(viewportWidth);
    pickerSwipeStartRef.current = null;
    window.setTimeout(() => {
      suppressPickerClickRef.current = false;
    }, 0);

    if (swipeStart.axis !== "horizontal" || Math.abs(deltaX) < swipeThreshold || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) {
      setPickerTransitionEnabled(true);
      setPickerPagerOffset(0);
      window.setTimeout(() => {
        if (!pickerTransitioningRef.current) {
          setPickerTransitionEnabled(false);
        }
      }, pickerTransitionMs);
      return;
    }

    changePickerMonth(deltaX < 0 ? 1 : -1);
  }

  function resetPickerSwipe() {
    if (pickerTransitioningRef.current) return;

    pickerSwipeStartRef.current = null;
    suppressPickerClickRef.current = false;
    setPickerTransitionEnabled(false);
    setPickerPagerOffset(0);
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={cn(modalBackdropClassName, "items-end justify-center p-3 sm:items-center sm:p-6", uiMotionClasses.modalBackdropIn)}
      onPointerDown={(pointerEvent) => {
        if (pointerEvent.target === pointerEvent.currentTarget && !saving) onClose();
      }}
    >
      <div className={cn(modalPanelClassName, "w-full max-w-sm p-3 sm:p-4", uiMotionClasses.modalPanelIn)} onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}>
        <div
          ref={pickerPagerRef}
          className="overflow-hidden"
          style={{ touchAction: "pan-y" }}
          onPointerDown={handlePickerSwipePointerDown}
          onPointerMove={handlePickerSwipePointerMove}
          onPointerUp={handlePickerSwipePointerUp}
          onPointerCancel={resetPickerSwipe}
        >
          <div
            className="flex w-full"
            style={{
              gap: pickerPageGap,
              transform: `translate3d(calc(-100% - ${pickerPageGap}px + ${pickerPagerOffset}px), 0, 0)`,
              transition: pickerTransitionEnabled ? `transform ${pickerTransitionMs}ms ${pickerTransitionEasing}` : undefined,
            }}
          >
            <MstvDatePickerMonthPage
              monthData={previousMonthData}
              selectedDate={selectedDate}
              saving={saving}
              interactive={false}
              onPreviousMonth={() => changePickerMonth(-1)}
              onNextMonth={() => changePickerMonth(1)}
              onSelectDate={selectDate}
            />
            <MstvDatePickerMonthPage
              monthData={monthData}
              selectedDate={selectedDate}
              saving={saving}
              interactive={!pickerAnimatingDirection}
              onPreviousMonth={() => changePickerMonth(-1)}
              onNextMonth={() => changePickerMonth(1)}
              onSelectDate={(dateKey) => {
                if (suppressPickerClickRef.current) return;
                selectDate(dateKey);
              }}
            />
            <MstvDatePickerMonthPage
              monthData={nextMonthData}
              selectedDate={selectedDate}
              saving={saving}
              interactive={false}
              onPreviousMonth={() => changePickerMonth(-1)}
              onNextMonth={() => changePickerMonth(1)}
              onSelectDate={selectDate}
            />
          </div>
        </div>

        {error && <div className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-base font-medium text-rose-700">{error}</div>}

        <div className="mt-3 flex justify-end px-1">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl bg-neutral-50 px-4 py-2 text-base font-semibold text-neutral-600 transition hover:bg-neutral-100 disabled:text-neutral-300"
          >
            Annuler
          </button>
        </div>
      </div>

      {pendingDate && (
        <div
          className="absolute inset-0 flex items-end justify-center bg-black/35 p-3 sm:items-center sm:p-6"
          onPointerDown={(pointerEvent) => {
            if (pointerEvent.target === pointerEvent.currentTarget && !saving) {
              onClose();
            }
          }}
        >
          <div className={cn(modalPanelClassName, "w-full max-w-sm p-4 sm:p-5")} onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}>
            <div className="mb-3">
              <h2 className="text-base font-semibold text-neutral-950">{confirmationTitle}</h2>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="rounded-2xl bg-neutral-50 px-3 py-3 text-left transition hover:bg-neutral-100 disabled:opacity-60"
              >
                <p className="text-xs font-semibold uppercase tracking-normal text-neutral-400">Ancienne date</p>
                <p className="mt-1 text-base font-semibold text-neutral-800">{formatFullDate(selectedDate)}</p>
              </button>
              <button
                type="button"
                onClick={() => void confirmDateChange()}
                disabled={saving}
                className="rounded-2xl bg-[#bb2720]/[0.06] px-3 py-3 text-left transition hover:bg-[#bb2720]/10 disabled:opacity-60"
              >
                <p className="text-xs font-semibold uppercase tracking-normal text-[#bb2720]/70">Nouvelle date</p>
                <p className="mt-1 text-base font-semibold text-[#bb2720]">{formatFullDate(pendingDate)}</p>
              </button>
            </div>

            {error && <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-base font-medium text-rose-700">{error}</div>}
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

function MstvDatePickerMonthPage({
  monthData,
  selectedDate,
  saving,
  interactive,
  onPreviousMonth,
  onNextMonth,
  onSelectDate,
}: {
  monthData: PickerMonthData;
  selectedDate: string;
  saving: boolean;
  interactive: boolean;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  onSelectDate: (dateKey: string) => void;
}) {
  return (
    <div className={cn("w-full shrink-0 px-1", !interactive && "pointer-events-none")}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onPreviousMonth}
          disabled={saving}
          className={cn(calendarArrowClassName, "hidden sm:flex")}
          aria-label="Mois précédent"
          tabIndex={interactive ? 0 : -1}
        >
          ←
        </button>
        <p className="text-base font-semibold text-neutral-950">
          {monthData.monthTitle} {monthData.year}
        </p>
        <button
          type="button"
          onClick={onNextMonth}
          disabled={saving}
          className={cn(calendarArrowClassName, "hidden sm:flex")}
          aria-label="Mois suivant"
          tabIndex={interactive ? 0 : -1}
        >
          →
        </button>
      </div>

      <div className="grid grid-cols-7">
        {weekdays.map((weekday, index) => (
          <span key={`${weekday}-${index}`} className="py-2 text-center text-xs font-semibold text-neutral-400">
            {weekday}
          </span>
        ))}
        {Array.from({ length: monthData.leadingEmptyDays }).map((_, index) => (
          <span key={`empty-start-${index}`} className="aspect-square" />
        ))}
        {monthData.calendarDays.map((day) => {
          const isSelected = day.dateKey === selectedDate;
          return (
            <button
              key={day.dateKey}
              type="button"
              onClick={() => onSelectDate(day.dateKey)}
              disabled={saving}
              className="flex aspect-square items-center justify-center rounded-full text-base font-semibold text-neutral-800 transition hover:bg-neutral-100 disabled:text-neutral-300"
              tabIndex={interactive ? 0 : -1}
            >
              <span className={cn("flex h-9 w-9 items-center justify-center rounded-full", isSelected && "bg-[#bb2720] text-white")}>{day.day}</span>
            </button>
          );
        })}
        {Array.from({ length: monthData.trailingEmptyDays }).map((_, index) => (
          <span key={`empty-end-${index}`} className="aspect-square" />
        ))}
      </div>
    </div>
  );
}
