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
const modalPanelClassName = "rounded-3xl border border-stone-200 bg-white shadow-xl shadow-black/10";
const formInputClassName =
  "h-11 w-full rounded-2xl border border-stone-200 bg-white px-3 text-base font-medium text-stone-950 outline-none transition focus:border-[#bb2720]/50";
const editorSectionClassName = "rounded-2xl border border-stone-200 bg-stone-50/60";

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
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  function commitValue() {
    onChange(normalizeCompactTimeInput(value));
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder="--:--"
      value={value}
      onChange={(event) => onChange(sanitizeTimeDraft(event.target.value))}
      onBlur={commitValue}
      onFocus={(event) => event.currentTarget.select()}
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
    <label className="block text-sm font-semibold text-stone-500">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function hasDetailsValues(form: EventEditorFormInput) {
  return Boolean(form.location.trim() || form.notes.trim());
}

function hasLiveTimeValues(form: EventEditorFormInput) {
  return Boolean(form.startTime.trim() || form.endTime.trim());
}

function CollapsibleSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className={editorSectionClassName}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-base font-semibold text-stone-700"
        aria-expanded={open}
      >
        <span>{title}</span>
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-lg leading-none text-stone-400">{open ? "-" : "+"}</span>
      </button>
      {open && <div className="space-y-3 border-t border-stone-200 px-4 py-3">{children}</div>}
    </section>
  );
}

function getSubmitErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (error && typeof error === "object" && "message" in error && typeof (error as { message?: unknown }).message === "string") {
    return (error as { message: string }).message.trim();
  }
  return "";
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
  const [detailsOpen, setDetailsOpen] = useState(() => hasDetailsValues(initialForm));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const hasLiveTimes = hasLiveTimeValues(form);
  const showLiveTimeFields = !form.isAllDay || hasLiveTimes;
  const selectableSyncCalendars = getSelectableEditorSyncCalendars({
    event,
    syncCalendars,
    currentExternalCalendarId,
  });

  useEffect(() => {
    if (isEditing || form.syncExternalCalendarId || selectableSyncCalendars.length === 0) return;
    setForm((current) => ({
      ...current,
      syncExternalCalendarId: current.syncExternalCalendarId ?? selectableSyncCalendars[0]?.id ?? null,
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

  useEscapeToClose(onClose);

  return (
    <div className={cn(modalBackdropClassName, modalSheetPositionClassName)} onPointerDown={(pointerEvent) => handleModalBackdropPointerDown(pointerEvent, onClose)}>
      <form
        onSubmit={handleSubmit}
        className={cn(modalPanelClassName, "flex max-h-[calc(100dvh-1.5rem)] w-full flex-col p-4 sm:max-h-[calc(100dvh-3rem)] sm:max-w-xl sm:p-6")}
        onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}
      >
        <div className="mb-4 flex shrink-0 items-center justify-between gap-4">
          <h2 className="text-base font-semibold text-stone-950">{isEditing ? "Modifier l'événement" : "Créer un événement"}</h2>
          <button type="button" onClick={onClose} className="rounded-full border border-stone-200 px-3 py-1.5 text-base font-semibold text-stone-600">
            Fermer
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex items-end gap-3">
            <div className="min-w-0 flex-1">
              <Field label="Date">
                <button
                  type="button"
                  onClick={() => setDatePickerOpen(true)}
                  className={cn(formInputClassName, "flex items-center text-left")}
                >
                  {formatFullDate(form.date)}
                </button>
              </Field>
            </div>
            <label className="flex h-11 shrink-0 items-center gap-2 rounded-2xl bg-stone-50/70 px-3 text-sm font-semibold text-stone-600">
              <span>Jour entier</span>
              <input
                type="checkbox"
                checked={form.isAllDay}
                onChange={(inputEvent) => updateField("isAllDay", inputEvent.target.checked)}
                className="h-5 w-5 accent-[#bb2720]"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Événement">
              <input value={form.clientName} onChange={(inputEvent) => updateField("clientName", inputEvent.target.value)} className={formInputClassName} />
            </Field>
            <Field label="Titre">
              <input value={form.eventName} onChange={(inputEvent) => updateField("eventName", inputEvent.target.value)} className={formInputClassName} />
            </Field>
          </div>

          {!form.isAllDay && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Début">
                <TimeTextInput value={form.clientArrivalTime} onChange={(value) => updateField("clientArrivalTime", value)} className={formInputClassName} />
              </Field>
              <Field label="Fin">
                <TimeTextInput value={form.endOfDayTime} onChange={(value) => updateField("endOfDayTime", value)} className={formInputClassName} />
              </Field>
            </div>
          )}

          {showLiveTimeFields && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Début live/tournage">
                <TimeTextInput value={form.startTime} onChange={(value) => updateField("startTime", value)} className={formInputClassName} />
              </Field>
              <Field label="Fin live/tournage">
                <TimeTextInput value={form.endTime} onChange={(value) => updateField("endTime", value)} className={formInputClassName} />
              </Field>
            </div>
          )}

          <CollapsibleSection title="Détails" open={detailsOpen} onToggle={() => setDetailsOpen((current) => !current)}>
            <Field label="Lieu">
              <input value={form.location} onChange={(inputEvent) => updateField("location", inputEvent.target.value)} className={formInputClassName} />
            </Field>

            <Field label="Notes">
              <textarea
                value={form.notes}
                onChange={(inputEvent) => updateField("notes", inputEvent.target.value)}
                className={cn(formInputClassName, "min-h-24 resize-none py-3")}
              />
            </Field>
          </CollapsibleSection>

          {((!isEditing && selectableSyncCalendars.length > 0) || Boolean(currentExternalCalendarId)) && (
            <Field label="Calendrier">
              <div className="space-y-1.5">
                <select
                  value={form.syncExternalCalendarId ?? selectableSyncCalendars[0]?.id ?? ""}
                  onChange={(selectEvent) => {
                    const nextValue = selectEvent.target.value || null;
                    setForm((current) => ({
                      ...current,
                      syncExternalCalendarId: nextValue,
                    }));
                  }}
                  disabled={!isEditing && selectableSyncCalendars.length === 0}
                  className={cn(formInputClassName, selectableSyncCalendars.length === 0 && "bg-stone-50 text-stone-400")}
                >
                  {selectableSyncCalendars.map((calendar) => (
                    <option key={calendar.id} value={calendar.id}>
                      {calendar.name}
                    </option>
                  ))}
                </select>
                {!isEditing && selectableSyncCalendars.length === 0 ? (
                  <p className="text-sm font-semibold text-stone-400">Aucun calendrier disponible.</p>
                ) : null}
              </div>
            </Field>
          )}
        </div>

        {error && <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-base font-medium text-rose-700">{error}</div>}

        <div className="mt-4 flex shrink-0 justify-end gap-2 border-t border-stone-100 pt-4">
          <button type="button" onClick={onClose} className="rounded-full border border-stone-200 bg-white px-4 py-2 text-base font-semibold text-stone-600">
            Annuler
          </button>
          <button disabled={submitting} className="rounded-full bg-[#bb2720] px-4 py-2 text-base font-semibold text-white disabled:bg-stone-300">
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
