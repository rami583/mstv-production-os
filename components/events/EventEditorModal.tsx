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

type EventEditorSubmitDiagnostic = {
  selectedCalendarId?: string | null;
  selectedProvider?: string | null;
  is_all_day?: boolean;
  date?: string;
  start_time?: string | null;
  end_time?: string | null;
  live_start_time?: string | null;
  live_end_time?: string | null;
  event_client_field?: string;
  title_field?: string;
  stage?: string | null;
  routeCalled?: string | null;
  responseStatus?: number | null;
  responseJson?: unknown;
  error?: unknown;
};

const modalBackdropClassName = "fixed inset-0 z-40 flex bg-black/35";
const modalSheetPositionClassName = "items-end p-3 sm:items-center sm:justify-center sm:p-6";
const modalPanelClassName = "rounded-3xl border border-stone-200 bg-white shadow-xl shadow-black/10";
const formInputClassName =
  "h-11 w-full rounded-2xl border border-stone-200 bg-white px-3 text-base font-medium text-stone-950 outline-none transition focus:border-[#bb2720]/50";

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
    <label className="block text-base font-semibold text-stone-500">
      <span className="mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}

function getSubmitDiagnostic(error: unknown): EventEditorSubmitDiagnostic | null {
  if (!error || typeof error !== "object" || !("eventEditorDiagnostic" in error)) return null;
  const diagnostic = (error as { eventEditorDiagnostic?: unknown }).eventEditorDiagnostic;
  return diagnostic && typeof diagnostic === "object" ? (diagnostic as EventEditorSubmitDiagnostic) : null;
}

function getSubmitErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (error && typeof error === "object" && "message" in error && typeof (error as { message?: unknown }).message === "string") {
    return (error as { message: string }).message.trim();
  }
  return "";
}

function stringifyDiagnosticValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    const serialized = JSON.stringify(value);
    return serialized.length > 1200 ? `${serialized.slice(0, 1200)}…` : serialized;
  } catch {
    return String(value);
  }
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
  const [form, setForm] = useState<EventEditorFormInput>(() => getEventEditorInitialForm(event, selectedDateKey));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitDiagnostic, setSubmitDiagnostic] = useState<EventEditorSubmitDiagnostic | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const selectableSyncCalendars = getSelectableEditorSyncCalendars({
    event,
    syncCalendars,
    currentExternalCalendarId,
  });
  async function handleSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setSubmitting(true);
    setError(null);
    setSubmitDiagnostic(null);

    try {
      const normalizedForm = getNormalizedEventEditorForm(form);
      setForm(normalizedForm);
      await onSubmit(normalizedForm);
    } catch (createError) {
      const selectedCalendar = syncCalendars.find((calendar) => calendar.id === form.syncExternalCalendarId) ?? null;
      const diagnostic = {
        selectedCalendarId: form.syncExternalCalendarId ?? null,
        selectedProvider: selectedCalendar?.providerType ?? null,
        is_all_day: form.isAllDay,
        date: form.date,
        start_time: form.clientArrivalTime || null,
        end_time: form.endOfDayTime || null,
        live_start_time: form.startTime || null,
        live_end_time: form.endTime || null,
        event_client_field: form.clientName,
        title_field: form.eventName,
        ...getSubmitDiagnostic(createError),
      } satisfies EventEditorSubmitDiagnostic;
      const fallback = isEditing ? "Impossible de modifier l'événement." : "Impossible de créer l'événement.";
      const rawMessage = getSubmitErrorMessage(createError);
      const userMessage = rawMessage || getUserFacingErrorMessage(createError, "Erreur inconnue.");
      setSubmitDiagnostic(diagnostic);
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
      <form onSubmit={handleSubmit} className={cn(modalPanelClassName, "w-full p-5 sm:max-w-xl sm:p-6")} onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-base font-semibold text-stone-950">{isEditing ? "Modifier l'événement" : "Créer un événement"}</h2>
          <button type="button" onClick={onClose} className="rounded-full border border-stone-200 px-3 py-1.5 text-base font-semibold text-stone-600">
            Fermer
          </button>
        </div>

        <div className="space-y-3">
          <Field label="Date">
            <button
              type="button"
              onClick={() => setDatePickerOpen(true)}
              className={cn(formInputClassName, "flex items-center text-left")}
            >
              {formatFullDate(form.date)}
            </button>
          </Field>

          <label className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-base font-semibold text-stone-700">
            <span>Jour entier</span>
            <input
              type="checkbox"
              checked={form.isAllDay}
              onChange={(inputEvent) => updateField("isAllDay", inputEvent.target.checked)}
              className="h-5 w-5 accent-[#bb2720]"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Événement">
              <input value={form.clientName} onChange={(inputEvent) => updateField("clientName", inputEvent.target.value)} className={formInputClassName} />
            </Field>
            <Field label="Titre">
              <input value={form.eventName} onChange={(inputEvent) => updateField("eventName", inputEvent.target.value)} className={formInputClassName} />
            </Field>
          </div>

          {!form.isAllDay && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Début">
                  <TimeTextInput value={form.clientArrivalTime} onChange={(value) => updateField("clientArrivalTime", value)} className={formInputClassName} />
                </Field>
                <Field label="Fin">
                  <TimeTextInput value={form.endOfDayTime} onChange={(value) => updateField("endOfDayTime", value)} className={formInputClassName} />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Début live/tournage">
                  <TimeTextInput value={form.startTime} onChange={(value) => updateField("startTime", value)} className={formInputClassName} />
                </Field>
                <Field label="Fin live/tournage">
                  <TimeTextInput value={form.endTime} onChange={(value) => updateField("endTime", value)} className={formInputClassName} />
                </Field>
              </div>
            </>
          )}

          {(!isEditing || selectableSyncCalendars.length > 0 || currentExternalCalendarId) && (
            <Field label="Calendrier">
              <div className="space-y-1.5">
                <select
                  value={form.syncExternalCalendarId ?? ""}
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
                  <option value="">Aucun calendrier externe</option>
                  {selectableSyncCalendars.map((calendar) => (
                    <option key={calendar.id} value={calendar.id}>
                      {calendar.name}
                    </option>
                  ))}
                </select>
                {!isEditing && selectableSyncCalendars.length === 0 ? (
                  <p className="text-sm font-semibold text-stone-400">Aucun calendrier externe bidirectionnel disponible.</p>
                ) : null}
              </div>
            </Field>
          )}
        </div>

        {error && <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-base font-medium text-rose-700">{error}</div>}

        {submitDiagnostic && !isEditing && (
          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
            <p className="font-semibold">Diagnostic temporaire création</p>
            <dl className="mt-2 grid gap-1">
              {([
                ["selected calendar id", submitDiagnostic.selectedCalendarId],
                ["selected provider", submitDiagnostic.selectedProvider],
                ["is_all_day", submitDiagnostic.is_all_day],
                ["date", submitDiagnostic.date],
                ["start_time", submitDiagnostic.start_time],
                ["end_time", submitDiagnostic.end_time],
                ["event/client field", submitDiagnostic.event_client_field],
                ["title field", submitDiagnostic.title_field],
                ["stage", submitDiagnostic.stage],
                ["route called", submitDiagnostic.routeCalled],
                ["response status", submitDiagnostic.responseStatus],
                ["response JSON/error", submitDiagnostic.responseJson ?? submitDiagnostic.error],
              ] as Array<[string, unknown]>).map(([label, value]) => (
                <div key={label} className="grid min-w-0 grid-cols-[9rem_minmax(0,1fr)] gap-2">
                  <dt className="text-amber-700">{label}</dt>
                  <dd className="min-w-0 break-words">{stringifyDiagnosticValue(value)}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
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
