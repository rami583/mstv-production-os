"use client";

import { useEffect, useState, type ComponentType, type FormEvent, type PointerEvent, type ReactNode } from "react";
import {
  getCurrentEditorExternalCalendarId,
  getEventEditorInitialForm,
  getNormalizedEventEditorForm,
  getSelectableEditorSyncCalendars,
  normalizeCompactTimeInput,
  sanitizeTimeDraft,
  type EventEditorEvent,
  type EventEditorExternalCalendar,
  type EventEditorFormInput,
} from "@/lib/events/editor";
import { useNativeKeyboardVisibility } from "@/lib/use-native-keyboard-visibility";
import { uiMotionClasses } from "@/lib/ui-motion";
import { cn } from "@/lib/utils";

type DatePickerProps = {
  selectedDate: string;
  onClose: () => void;
  onSelectDate: (date: string) => Promise<void> | void;
};

type EventEditorModalProps = {
  selectedDateKey: string;
  event: EventEditorEvent | null;
  syncCalendars: EventEditorExternalCalendar[];
  onClose: () => void;
  onSubmit: (input: EventEditorFormInput) => Promise<void>;
  DatePickerComponent: ComponentType<DatePickerProps>;
  formatFullDate: (dateKey: string) => string;
  getUserFacingErrorMessage: (error: unknown, fallback?: string) => string;
};

const modalBackdropClassName = "fixed inset-0 z-40 flex bg-black/35";
const modalSheetPositionClassName = "items-end p-3 sm:items-center sm:justify-center sm:p-6";
const modalPanelClassName = "rounded-2xl bg-white shadow-sm shadow-black/5";
const formInputClassName =
  "h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-base font-medium text-neutral-950 outline-none transition focus:border-[#bb2720]/50";
const iosKeyboardGuardProps = { "data-ios-keyboard-guard": "true" } as const;

function useEscapeToClose(onClose: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [enabled, onClose]);
}

function handleModalBackdropPointerDown(pointerEvent: PointerEvent<HTMLDivElement>, onClose: () => void) {
  if (pointerEvent.target === pointerEvent.currentTarget) {
    onClose();
  }
}

function TimeTextInput({
  value,
  onChange,
  onEditingChange,
  onFocusTarget,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onEditingChange?: (editing: boolean) => void;
  onFocusTarget?: (target: HTMLElement) => boolean;
  className?: string;
}) {
  function commitValue() {
    onChange(normalizeCompactTimeInput(value));
  }

  return (
    <input
      {...iosKeyboardGuardProps}
      type="text"
      inputMode="numeric"
      enterKeyHint="done"
      placeholder="--:--"
      value={value}
      onChange={(event) => onChange(sanitizeTimeDraft(event.target.value))}
      onBlur={() => {
        commitValue();
        onEditingChange?.(false);
      }}
      onFocus={(event) => {
        onEditingChange?.(true);
        const target = event.currentTarget;
        target.select();
        const handledByModal = onFocusTarget?.(target) ?? false;
        if (handledByModal) return;
        window.setTimeout(() => {
          if (typeof target.scrollIntoView !== "function") return;
          target.scrollIntoView({ block: "center", behavior: "smooth" });
        }, 80);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commitValue();
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      className={className}
    />
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-semibold text-neutral-500">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function getSubmitErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (error && typeof error === "object" && "message" in error && typeof (error as { message?: unknown }).message === "string") {
    return (error as { message: string }).message.trim();
  }
  return "";
}

function isEditableEditorElement(element: Element | null) {
  return Boolean(element?.closest("input, textarea, select"));
}

function isInteractiveEditorElement(element: Element | null) {
  return Boolean(element?.closest("input, textarea, select, button, a, label, [role='button'], [contenteditable='true']"));
}

export function EventEditorModal({
  selectedDateKey,
  event,
  syncCalendars,
  onClose,
  onSubmit,
  DatePickerComponent,
  formatFullDate,
  getUserFacingErrorMessage,
}: EventEditorModalProps) {
  const isEditing = Boolean(event);
  const currentExternalCalendarId = getCurrentEditorExternalCalendarId(event);
  const [initialForm] = useState<EventEditorFormInput>(() => getEventEditorInitialForm(event, selectedDateKey));
  const [form, setForm] = useState<EventEditorFormInput>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [timeKeyboardActive, setTimeKeyboardActive] = useState(false);
  const nativeKeyboard = useNativeKeyboardVisibility<HTMLDivElement>();
  const selectableSyncCalendars = getSelectableEditorSyncCalendars({
    event,
    syncCalendars,
    currentExternalCalendarId,
  });

  useEffect(() => {
    if (isEditing || selectableSyncCalendars.length === 0) return;
    if (form.syncExternalCalendarId && selectableSyncCalendars.some((calendar) => calendar.id === form.syncExternalCalendarId)) return;
    setForm((current) => ({
      ...current,
      syncExternalCalendarId: selectableSyncCalendars[0]?.id ?? null,
    }));
  }, [form.syncExternalCalendarId, isEditing, selectableSyncCalendars]);

  async function handleSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const normalizedForm = getNormalizedEventEditorForm(form);
      setForm(normalizedForm);
      await onSubmit(normalizedForm);
    } catch (createError) {
      const fallback = isEditing ? "Impossible de modifier l'événement." : "Impossible de créer l'événement.";
      const rawMessage = getSubmitErrorMessage(createError);
      const userMessage = rawMessage || getUserFacingErrorMessage(createError, "Erreur inconnue.");
      setError(isEditing ? getUserFacingErrorMessage(createError, fallback) : `Impossible de créer l'événement : ${userMessage || "Erreur inconnue."}`);
    } finally {
      setSubmitting(false);
    }
  }

  function updateField<Key extends keyof EventEditorFormInput>(key: Key, value: EventEditorFormInput[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function dismissTimeKeyboard() {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setTimeKeyboardActive(false);
  }

  function handlePanelPointerDown(pointerEvent: PointerEvent<HTMLFormElement>) {
    const target = pointerEvent.target instanceof Element ? pointerEvent.target : null;
    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!activeElement || !isEditableEditorElement(activeElement) || isInteractiveEditorElement(target)) return;

    activeElement.blur();
    setTimeKeyboardActive(false);
  }

  useEscapeToClose(onClose);

  return (
    <div className={cn(modalBackdropClassName, modalSheetPositionClassName, uiMotionClasses.modalBackdropIn)} onPointerDown={(pointerEvent) => handleModalBackdropPointerDown(pointerEvent, onClose)}>
      <form
        onSubmit={handleSubmit}
        className={cn(modalPanelClassName, "flex max-h-[calc(var(--app-height)-1.5rem)] w-full flex-col p-4 sm:max-h-[calc(var(--app-height)-3rem)] sm:max-w-xl sm:p-6", uiMotionClasses.modalPanelIn)}
        onPointerDownCapture={handlePanelPointerDown}
        onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}
      >
        <div className="mb-4 flex shrink-0 items-center justify-between gap-4">
          <h2 className="text-base font-semibold text-neutral-950">{isEditing ? "Modifier l'événement" : "Créer un événement"}</h2>
          <button type="button" onClick={onClose} className="rounded-xl bg-neutral-50 px-3 py-1.5 text-base font-semibold text-neutral-600 transition hover:bg-neutral-100">
            Fermer
          </button>
        </div>

        <div
          ref={nativeKeyboard.scrollContainerRef}
          className={cn(
            "min-h-0 flex-1 space-y-3 overflow-y-auto pr-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            timeKeyboardActive ? "pb-24 sm:pb-0" : "pb-1",
          )}
          style={nativeKeyboard.scrollContainerStyle}
        >
          {(!isEditing || Boolean(currentExternalCalendarId)) && (
            <Field label="Calendrier">
              <div className="space-y-1.5">
                {selectableSyncCalendars.length > 0 ? (
                  <select
                    {...iosKeyboardGuardProps}
                    value={form.syncExternalCalendarId ?? selectableSyncCalendars[0]?.id ?? ""}
                    onFocus={(selectEvent) => nativeKeyboard.handleFieldFocus(selectEvent.currentTarget)}
                    onChange={(selectEvent) => {
                      const nextValue = selectEvent.target.value || null;
                      setForm((current) => ({
                        ...current,
                        syncExternalCalendarId: nextValue,
                      }));
                    }}
                    className={formInputClassName}
                  >
                    {selectableSyncCalendars.map((calendar) => (
                      <option key={calendar.id} value={calendar.id}>
                        {calendar.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="rounded-xl bg-neutral-50 px-3 py-2 text-sm font-semibold text-neutral-500">
                    Aucun calendrier synchronisé actif n’est disponible pour créer cet événement.
                  </p>
                )}
              </div>
            </Field>
          )}

          <div className="space-y-1">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-neutral-500">Date</span>
              <label className="flex shrink-0 items-center gap-2 text-sm font-semibold text-neutral-600">
                <span>Jour entier</span>
                <input
                  {...iosKeyboardGuardProps}
                  type="checkbox"
                  checked={form.isAllDay}
                  onFocus={(inputEvent) => nativeKeyboard.handleFieldFocus(inputEvent.currentTarget)}
                  onChange={(inputEvent) => updateField("isAllDay", inputEvent.target.checked)}
                  className="h-5 w-5 accent-[#bb2720]"
                />
              </label>
            </div>
            <button
              {...iosKeyboardGuardProps}
              type="button"
              onFocus={(buttonEvent) => nativeKeyboard.handleFieldFocus(buttonEvent.currentTarget)}
              onClick={() => setDatePickerOpen(true)}
              className={cn(formInputClassName, "flex items-center text-left")}
            >
              {formatFullDate(form.date)}
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nom du client">
              <input
                {...iosKeyboardGuardProps}
                value={form.clientName}
                onFocus={(inputEvent) => nativeKeyboard.handleFieldFocus(inputEvent.currentTarget)}
                onChange={(inputEvent) => updateField("clientName", inputEvent.target.value)}
                className={formInputClassName}
              />
            </Field>
            <Field label="Titre de l’événement">
              <input
                {...iosKeyboardGuardProps}
                value={form.eventName}
                onFocus={(inputEvent) => nativeKeyboard.handleFieldFocus(inputEvent.currentTarget)}
                onChange={(inputEvent) => updateField("eventName", inputEvent.target.value)}
                className={formInputClassName}
              />
            </Field>
          </div>

          {!form.isAllDay && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Début">
                <TimeTextInput value={form.clientArrivalTime} onChange={(value) => updateField("clientArrivalTime", value)} onEditingChange={setTimeKeyboardActive} onFocusTarget={nativeKeyboard.handleFieldFocus} className={formInputClassName} />
              </Field>
              <Field label="Fin">
                <TimeTextInput value={form.endOfDayTime} onChange={(value) => updateField("endOfDayTime", value)} onEditingChange={setTimeKeyboardActive} onFocusTarget={nativeKeyboard.handleFieldFocus} className={formInputClassName} />
              </Field>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Début live/tournage">
              <TimeTextInput value={form.startTime} onChange={(value) => updateField("startTime", value)} onEditingChange={setTimeKeyboardActive} onFocusTarget={nativeKeyboard.handleFieldFocus} className={formInputClassName} />
            </Field>
            <Field label="Fin live/tournage">
              <TimeTextInput value={form.endTime} onChange={(value) => updateField("endTime", value)} onEditingChange={setTimeKeyboardActive} onFocusTarget={nativeKeyboard.handleFieldFocus} className={formInputClassName} />
            </Field>
          </div>

          <Field label="Lieu">
            <input
              {...iosKeyboardGuardProps}
              value={form.location}
              onFocus={(inputEvent) => nativeKeyboard.handleFieldFocus(inputEvent.currentTarget)}
              onChange={(inputEvent) => updateField("location", inputEvent.target.value)}
              className={formInputClassName}
            />
          </Field>

          <Field label="Notes">
            <textarea
              {...iosKeyboardGuardProps}
              value={form.notes}
              onFocus={(textareaEvent) => nativeKeyboard.handleFieldFocus(textareaEvent.currentTarget)}
              onChange={(inputEvent) => updateField("notes", inputEvent.target.value)}
              className={cn(formInputClassName, "min-h-24 resize-none py-3")}
            />
          </Field>
        </div>

        {error && <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-base font-medium text-rose-700">{error}</div>}

        {timeKeyboardActive && (
          <div className="-mx-4 mt-3 flex shrink-0 justify-end border-y border-neutral-100 bg-neutral-50 px-4 py-2 sm:hidden">
            <button type="button" onPointerDown={(event) => event.preventDefault()} onClick={dismissTimeKeyboard} className="rounded-xl bg-white px-4 py-2 text-base font-semibold text-neutral-700 shadow-sm shadow-black/5">
              Terminé
            </button>
          </div>
        )}

        <div
          className="sticky bottom-0 -mx-4 mt-4 flex shrink-0 justify-end gap-2 border-t border-neutral-100 bg-white px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 sm:static sm:mx-0 sm:px-0 sm:pb-0"
          style={nativeKeyboard.footerLiftStyle}
        >
          <button type="button" onClick={onClose} className="rounded-xl bg-neutral-50 px-4 py-2 text-base font-semibold text-neutral-600 transition hover:bg-neutral-100">
            Annuler
          </button>
          <button disabled={submitting} className="rounded-xl bg-[#bb2720] px-4 py-2 text-base font-semibold text-white disabled:bg-neutral-300">
            {submitting ? (isEditing ? "Modification..." : "Création...") : isEditing ? "Modifier" : "Créer"}
          </button>
        </div>

        {datePickerOpen && (
          <DatePickerComponent
            selectedDate={form.date}
            onClose={() => setDatePickerOpen(false)}
            onSelectDate={(date) => {
              updateField("date", date);
              setDatePickerOpen(false);
            }}
          />
        )}
      </form>
    </div>
  );
}
