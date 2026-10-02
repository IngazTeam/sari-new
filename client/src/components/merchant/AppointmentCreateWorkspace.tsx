import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { catalogEditorContextSchema } from "@shared/service-catalog-workspace";
import { appointmentAvailabilitySchema } from "@shared/appointment-creation";
import {
  appointmentReceiptView,
  type AppointmentRequestView,
} from "@shared/appointment-workspace";
import {
  emptyAppointmentDraft,
  parseAppointmentDraft,
  pendingAppointmentRequest,
  rememberAppointmentRequest,
  clearAppointmentRequest,
  scopedAppointmentRequest,
  scopedAppointmentSlots,
  type AppointmentDraft,
} from "@/lib/appointment-create";
import { appointmentCreateLabels } from "@/lib/appointment-create-labels";
import { bookingEndTime } from "@/lib/booking-workspace";
import { calendarWorkspaceLabels } from "@/lib/calendar-workspace-labels";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { CatalogChoicePicker } from "./CatalogChoicePicker";
import "@/styles/service-editor-workspace.css";
import "@/styles/appointment-create.css";

export function AppointmentCreateWorkspace({
  actorId,
  merchantId,
  canManage,
  current,
  requestId,
  retainRequest,
  refresh,
  leave,
  openAppointment,
}: {
  actorId: number;
  merchantId: number;
  canManage: boolean;
  current: boolean;
  requestId: string | null;
  retainRequest: (id: string) => void;
  refresh: () => void;
  leave: () => void;
  openAppointment: (id: number) => void;
}) {
  const { t, i18n } = useTranslation(),
    text = appointmentCreateLabels(t),
    calendarText = calendarWorkspaceLabels(t),
    utils = trpc.useUtils();
  const [draft, setDraft] = useState<AppointmentDraft>({
      ...emptyAppointmentDraft,
    }),
    [names, setNames] = useState<{
      service: Record<number, string>;
      staff: Record<number, string>;
    }>({ service: {}, staff: {} }),
    [errors, setErrors] = useState<Record<string, boolean>>({});
  const [initial] = useState(() => {
    try {
      return {
        id: pendingAppointmentRequest(
          window.sessionStorage,
          actorId,
          merchantId
        ),
        failed: false,
      };
    } catch {
      return { id: null, failed: true };
    }
  });
  const id = requestId ?? initial.id;
  const [busy, setBusy] = useState<"save" | "check" | null>(null),
    [failure, setFailure] = useState<
      "uncertain" | "storage" | "blocked" | null
    >(null),
    [evidence, setEvidence] = useState<AppointmentRequestView | null>(null),
    [dialog, setDialog] = useState<"review" | "leave" | null>(null);
  const live = useRef(true),
    lock = useRef(false),
    attempt = useRef<
      | (NonNullable<ReturnType<typeof parseAppointmentDraft>["data"]> & {
          requestId: string;
        })
      | null
    >(null),
    reviewed = useRef(""),
    opener = useRef<HTMLElement | null>(null),
    heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  useEffect(() => {
    if (!requestId && initial.id) retainRequest(initial.id);
  }, [requestId, initial.id]);
  const create = trpc.calendar.bookAppointment.useMutation();
  const lookup = trpc.calendar.getBookingRequest.useQuery(
    { requestId: id ?? "00000000-0000-4000-8000-000000000000" },
    {
      enabled: !!id && canManage,
      retry: false,
      staleTime: 0,
      refetchOnMount: "always",
      refetchOnWindowFocus: false,
    }
  );
  const result =
    evidence?.requestId === id
      ? evidence
      : !lookup.error && id
        ? scopedAppointmentRequest(lookup.data, actorId, merchantId, id)
        : null;
  const serviceQuery = trpc.services.catalogEditor.useQuery(
    { entity: "service", id: draft.serviceId || undefined },
    {
      enabled: draft.serviceId > 0,
      retry: false,
      staleTime: 0,
      refetchOnMount: "always",
      refetchOnWindowFocus: false,
    }
  );
  const parsed = catalogEditorContextSchema.safeParse(serviceQuery.data),
    service =
      !serviceQuery.error &&
      parsed.success &&
      parsed.data.actorId === actorId &&
      parsed.data.merchantId === merchantId &&
      parsed.data.selection.id === draft.serviceId &&
      parsed.data.record?.entity === "service"
        ? parsed.data.record
        : null;
  const validService =
    !!service &&
    service.fields.isActive === true &&
    Number.isInteger(service.fields.durationMinutes) &&
    service.fields.durationMinutes! >= 1 &&
    service.fields.durationMinutes! <= 1439;
  const validStaff =
    !draft.staffId ||
    (!!service &&
      service.fields.staffIds !== null &&
      (!service.fields.staffIds.length ||
        service.fields.staffIds.includes(draft.staffId)));
  const selection = {
      serviceId: draft.serviceId,
      staffId: draft.staffId || undefined,
      date: draft.appointmentDate,
    },
    availableInput = appointmentAvailabilitySchema.safeParse(selection);
  const availability = trpc.calendar.getAvailableSlots.useQuery(selection, {
    enabled: false,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
  const available = !availability.error
    ? scopedAppointmentSlots(availability.data, actorId, merchantId, selection)
    : null;
  const completed =
      result?.state === "recorded" ||
      result?.state === "appointment_unavailable",
    frozen =
      !!busy ||
      !!attempt.current ||
      (!!id && (!result || result.state !== "not_found"));
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(emptyAppointmentDraft) || !!id;
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty && !completed) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, completed]);
  function clearPending(request: string) {
    try {
      clearAppointmentRequest(
        window.sessionStorage,
        actorId,
        merchantId,
        request
      );
    } catch {
      /* A retained ID is safe to inspect again. */
    }
  }
  useEffect(() => {
    if (result && result.state !== "not_found") clearPending(result.requestId);
  }, [result?.state, result?.requestId]);
  async function read(request: string) {
    const raw = await utils.calendar.getBookingRequest.fetch(
      { requestId: request },
      { staleTime: 0 }
    );
    const parsed = scopedAppointmentRequest(raw, actorId, merchantId, request);
    if (!parsed) throw Error("Invalid request evidence");
    return parsed;
  }
  async function verify() {
    if (!id || lock.current || !canManage) return;
    lock.current = true;
    setBusy("check");
    setFailure(null);
    try {
      const checked = await read(id);
      if (live.current) {
        setEvidence(checked);
        if (checked.state !== "not_found") clearPending(id);
      }
    } catch {
      if (live.current) setFailure("blocked");
    } finally {
      if (live.current) {
        lock.current = false;
        setBusy(null);
      }
    }
  }
  async function send(command: NonNullable<typeof attempt.current>) {
    if (
      lock.current ||
      !current ||
      !canManage ||
      (id && command.requestId !== id)
    )
      return;
    try {
      rememberAppointmentRequest(
        window.sessionStorage,
        actorId,
        merchantId,
        command.requestId
      );
    } catch {
      setFailure("storage");
      setDialog(null);
      return;
    }
    lock.current = true;
    attempt.current = command;
    setBusy("save");
    setFailure(null);
    setEvidence(null);
    retainRequest(command.requestId);
    try {
      const response = await create.mutateAsync(command);
      if (!live.current) return;
      const receipt = appointmentReceiptView.safeParse(response);
      if (
        !receipt.success ||
        receipt.data.actorId !== actorId ||
        receipt.data.merchantId !== merchantId ||
        receipt.data.requestId !== command.requestId
      )
        throw Error("Invalid receipt");
      const checked = await read(command.requestId);
      if (!live.current) return;
      if (
        checked.state !== "recorded" ||
        checked.appointmentId !== receipt.data.appointmentId
      )
        throw Error("Unconfirmed request");
      setEvidence(checked);
      clearPending(command.requestId);
      setDialog(null);
    } catch {
      if (live.current) {
        setFailure("uncertain");
        setDialog(null);
      }
    } finally {
      if (live.current) {
        lock.current = false;
        setBusy(null);
      }
    }
  }
  const end = validService
    ? bookingEndTime(draft.startTime, String(service!.fields.durationMinutes))
    : "";
  function validate() {
    const parsed = parseAppointmentDraft(draft),
      problems = {
        ...parsed.errors,
        ...(!validService ? { serviceId: true } : {}),
        ...(!validStaff ? { staffId: true } : {}),
        ...(!end ? { startTime: true } : {}),
      };
    return { data: parsed.data, errors: problems };
  }
  function openReview() {
    const value = validate();
    setErrors(value.errors);
    if (!value.data || Object.keys(value.errors).length) {
      queueMicrotask(() =>
        document
          .querySelector<HTMLElement>(
            '[data-appointment-create] [aria-invalid="true"]'
          )
          ?.focus()
      );
      return;
    }
    if (!current || !canManage || frozen || serviceQuery.isFetching) return;
    reviewed.current = JSON.stringify(value.data);
    opener.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setDialog("review");
  }
  function confirm() {
    const checked = validate();
    if (
      !checked.data ||
      Object.keys(checked.errors).length ||
      reviewed.current !== JSON.stringify(checked.data) ||
      frozen ||
      serviceQuery.isFetching
    )
      return;
    let request = id;
    try {
      request ??= crypto.randomUUID();
    } catch {
      setFailure("storage");
      return;
    }
    void send({ ...checked.data, requestId: request });
  }
  function patch(key: keyof AppointmentDraft, value: string | number) {
    setDraft(previous => ({
      ...previous,
      [key]: value,
      ...(key === "serviceId" ? { staffId: 0 } : {}),
    }));
    setErrors(previous => ({ ...previous, [key]: false }));
  }
  const fields = {
    appointmentDate: "date",
    startTime: "time",
    customerPhone: "phone",
    customerName: "name",
    notes: "notes",
  } as const;
  const field = (key: keyof typeof fields, required = false) => {
    const invalid = !!errors[key],
      type =
        key === "appointmentDate"
          ? "date"
          : key === "startTime"
            ? "time"
            : key === "customerPhone"
              ? "tel"
              : "text";
    const props = {
      id: `ac-${key}`,
      value: draft[key],
      required,
      "aria-invalid": invalid,
      "aria-describedby": invalid ? `ac-${key}-error` : undefined,
      onChange: (
        event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
      ) => patch(key, event.target.value),
      maxLength:
        key === "notes"
          ? 2000
          : key === "customerName"
            ? 255
            : key === "customerPhone"
              ? 20
              : 30,
    };
    return (
      <label className="bw-field">
        <span>
          {text(fields[key])}{" "}
          {required ? (
            <span aria-hidden="true">*</span>
          ) : (
            <small>{text("optional")}</small>
          )}
        </span>
        {key === "notes" ? (
          <textarea {...props} rows={3} />
        ) : (
          <input
            {...props}
            type={type}
            onInput={
              type === "date" || type === "time"
                ? event => patch(key, event.currentTarget.value)
                : undefined
            }
            dir={type === "text" ? undefined : "ltr"}
          />
        )}
        {invalid && (
          <span id={`ac-${key}-error`} role="alert" className="bw-error">
            {text(key === "customerPhone" ? "phoneError" : "invalid")}
          </span>
        )}
      </label>
    );
  };
  const picker = (kind: "service" | "staff") => (
    <div
      className="bw-field"
      aria-invalid={!!errors[kind + "Id"]}
      tabIndex={-1}
    >
      <h3>
        {text(kind)} {kind === "service" ? "*" : text("optional")}
      </h3>
      <CatalogChoicePicker
        single
        actorId={actorId}
        merchantId={merchantId}
        kind={kind}
        selected={
          draft[kind === "service" ? "serviceId" : "staffId"]
            ? [draft[kind === "service" ? "serviceId" : "staffId"]]
            : []
        }
        names={names[kind]}
        disabled={!canManage || frozen}
        onChange={ids =>
          patch(kind === "service" ? "serviceId" : "staffId", ids.at(-1) ?? 0)
        }
        onNames={rows =>
          setNames(previous => ({
            ...previous,
            [kind]: {
              ...previous[kind],
              ...Object.fromEntries(rows.map(row => [row.id, row.name])),
            },
          }))
        }
      />
      {errors[kind + "Id"] && (
        <p role="alert" className="bw-error">
          {text(kind === "service" ? "serviceError" : "staffError")}
        </p>
      )}
    </div>
  );
  const summary = (
    <dl className="bw-detail-facts">
      {[
        [
          text("service"),
          names.service[draft.serviceId] ??
            service?.fields.name ??
            text("none"),
        ],
        [
          text("staff"),
          draft.staffId
            ? (names.staff[draft.staffId] ?? text("none"))
            : text("none"),
        ],
        [text("date"), draft.appointmentDate],
        [text("time"), draft.startTime],
        [text("end"), end],
        [text("phone"), draft.customerPhone],
        [text("name"), draft.customerName || text("none")],
        [text("notes"), draft.notes || text("none")],
      ].map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
  return (
    <div
      className="service-catalog booking-workspace appointment-create"
      data-appointment-create
      dir={i18n.language.startsWith("ar") ? "rtl" : "ltr"}
    >
      <header className="sc-header">
        <div>
          <Button
            variant="ghost"
            disabled={!!busy}
            onClick={() => {
              if (dirty && !completed) {
                opener.current = document.activeElement as HTMLElement;
                setDialog("leave");
              } else leave();
            }}
          >
            {text("back")}
          </Button>
          <h1>{text("title")}</h1>
          <p>{text("hint")}</p>
        </div>
        <Button
          variant="outline"
          disabled={!!busy || serviceQuery.isFetching}
          onClick={() => {
            refresh();
            if (draft.serviceId) void serviceQuery.refetch();
            if (id) void verify();
          }}
        >
          {text("refresh")}
        </Button>
      </header>
      {!current && (
        <p role="alert" className="sc-feedback">
          {text("sourceError")}
        </p>
      )}
      {!canManage && <p className="sc-feedback">{text("readOnly")}</p>}
      {(failure || initial.failed) && (
        <p className="sc-feedback" role="alert">
          {text(failure ?? "storage")}
        </p>
      )}
      {id && (
        <section className="bw-panel">
          {initial.id&&!completed&&<p className="sc-muted">{text("restored")}</p>}
          {!completed&&<dl className="bw-detail-facts">
            <div>
              <dt>{text("request")}</dt>
              <dd>
                <bdi>{id}</bdi>
              </dd>
            </div>
          </dl>}
          <p role="status">
            {text(
              busy === "check"
                ? "checking"
                : result?.state === "recorded"
                  ? "recorded"
                  : result?.state === "appointment_unavailable"
                    ? "unavailable"
                    : result?.state === "not_found"
                      ? "notFound"
                      : "uncertain"
            )}
          </p>
          {completed&&<details><summary>{text("request")}</summary><p className="bw-notes"><bdi>{id}</bdi></p></details>}
          {result?.state === "recorded" && (
            <>
              <p>{calendarText(result.calendarSyncState)}</p>
              {!["none", "synced", "cancelled"].includes(
                result.calendarSyncState
              ) && <p className="sc-feedback">{text("syncReview")}</p>}
              <Button onClick={() => openAppointment(result.appointmentId)}>
                {text("open")}
              </Button>
            </>
          )}
          {!completed && (
            <div className="sc-actions">
              <Button
                variant="outline"
                disabled={!!busy || !canManage}
                onClick={() => void verify()}
              >
                {text("verify")}
              </Button>
              {result?.state === "not_found" &&
                attempt.current?.requestId === id &&
                !failure && (
                  <Button
                    disabled={!!busy || !current || !canManage}
                    onClick={() => void send(attempt.current!)}
                  >
                    {text("retry")}
                  </Button>
                )}
            </div>
          )}
        </section>
      )}
      {!completed && (
        <form
          className="bw-form"
          noValidate
          onSubmit={event => {
            event.preventDefault();
            openReview();
          }}
        >
          <fieldset disabled={!canManage || frozen}>
            <section className="bw-panel">
              <h2>{text("service")}</h2>
              {picker("service")}
              {picker("staff")}
              {draft.serviceId > 0 &&
                !validService &&
                !serviceQuery.isFetching && (
                  <p role="alert" className="bw-error">
                    {text("serviceError")}
                  </p>
                )}
            </section>
            <section className="bw-panel">
              <h2>{text("date")}</h2>
              <div className="bw-form-grid">
                {field("appointmentDate", true)}
                {field("startTime", true)}
              </div>
              <p className="sc-muted">{text("advisory")}</p>
              <p className="sc-muted">{text("manual")}</p>
              {end && (
                <p>
                  {text("end")}: <bdi>{end}</bdi>
                </p>
              )}
              <details>
                <summary>{text("availability")}</summary>
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    !availableInput.success ||
                    !validService ||
                    !validStaff ||
                    availability.isFetching ||
                    serviceQuery.isFetching
                  }
                  onClick={() => void availability.refetch()}
                >
                  {text(availability.isFetching ? "loading" : "check")}
                </Button>
                {(availability.error ||
                  (availability.data !== undefined && !available)) && (
                  <p role="alert" className="bw-error">
                    {text("availabilityError")}
                  </p>
                )}
                {available && !availability.isFetching && (
                  <div className="ac-slots">
                    {available.slots.length ? (
                      available.slots.map(time => (
                        <Button
                          type="button"
                          variant="outline"
                          key={time}
                          onClick={() => patch("startTime", time)}
                        >
                          {time}
                        </Button>
                      ))
                    ) : (
                      <p>{text("noSlots")}</p>
                    )}
                  </div>
                )}
              </details>
            </section>
            <section className="bw-panel">
              <h2>{text("phone")}</h2>
              <div className="bw-form-grid">
                {field("customerPhone", true)}
                {field("customerName")}
              </div>
              {field("notes")}
            </section>
          </fieldset>
          <footer className="bw-save">
            <p role="status">
              {text(busy === "save" ? "saving" : id ? "uncertain" : "unsaved")}
            </p>
            <Button
              type="submit"
              disabled={
                !current ||
                !canManage ||
                frozen ||
                serviceQuery.isFetching ||
                initial.failed
              }
            >
              {text("review")}
            </Button>
          </footer>
        </form>
      )}
      <Dialog
        open={dialog !== null}
        onOpenChange={open => {
          if (!open && !busy) setDialog(null);
        }}
      >
        <DialogContent
          className="sc-dialog booking-dialog"
          closeLabel={text("cancel")}
          showCloseButton={!busy}
          dir={i18n.language.startsWith("ar") ? "rtl" : "ltr"}
          onOpenAutoFocus={event => {
            event.preventDefault();
            heading.current?.focus();
          }}
          onCloseAutoFocus={event => {
            event.preventDefault();
            if (opener.current?.isConnected) opener.current.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle ref={heading} tabIndex={-1}>
              {text(dialog === "leave" ? "leaveTitle" : "review")}
            </DialogTitle>
            <DialogDescription>
              {text(dialog === "leave" ? "leaveHint" : "reviewHint")}
            </DialogDescription>
          </DialogHeader>
          {dialog === "review" && summary}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={!!busy}
              onClick={() => setDialog(null)}
            >
              {text("cancel")}
            </Button>
            <Button
              disabled={
                !!busy ||
                (dialog === "review" &&
                  (!current || !canManage || frozen || serviceQuery.isFetching))
              }
              onClick={() => (dialog === "leave" ? leave() : confirm())}
            >
              {text(
                busy === "save"
                  ? "saving"
                  : dialog === "leave"
                    ? "leave"
                    : "confirm"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
