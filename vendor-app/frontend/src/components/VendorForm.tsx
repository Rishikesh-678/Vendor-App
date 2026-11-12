import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from "react";

import { ApiError, type FieldErrors } from "../api/client";
import type { Vendor } from "../api/types";
import { createVendor, updateVendor } from "../api/vendors";
import { Icon } from "./Icon";
import { Modal, ModalFooter } from "./Modal";
import { Spinner } from "./Spinner";
import { useToast } from "./Toast";

const SERVICE_SUGGESTIONS = ["SaaS", "Cloud", "Hardware", "Consulting", "Support/AMC", "Other"];
const CURRENCY_SUGGESTIONS = ["INR", "USD", "EUR", "GBP", "SGD", "AED"];
const ALLOWED_EXT = [".pdf", ".docx", ".png", ".jpg", ".jpeg"];
const MAX_FILE_BYTES = 10 * 1024 * 1024;

interface Props {
  vendor?: Vendor; // present = edit mode
  onClose: () => void;
}

interface Values {
  name: string;
  start_date: string;
  renewal_date: string;
  cost: string;
  currency: string;
  nature_of_service: string;
}

function validate(v: Values, file: File | null): FieldErrors {
  const e: FieldErrors = {};
  if (!v.name.trim()) e.name = "Vendor name is required";
  else if (v.name.trim().length > 200) e.name = "Maximum 200 characters";
  if (!v.start_date) e.start_date = "Start date is required";
  if (!v.renewal_date) e.renewal_date = "Renewal date is required";
  else if (v.start_date && v.renewal_date < v.start_date)
    e.renewal_date = "Renewal date must be on or after the start date";
  if (v.cost.trim() === "") e.cost = "Cost is required";
  else if (!/^\d{1,10}(\.\d{1,2})?$/.test(v.cost.trim()))
    e.cost = "Enter a non-negative amount with up to 2 decimals";
  if (!/^[A-Za-z]{3}$/.test(v.currency.trim())) e.currency = "3-letter currency code";
  if (!v.nature_of_service.trim()) e.nature_of_service = "Nature of service is required";
  else if (v.nature_of_service.trim().length > 200) e.nature_of_service = "Maximum 200 characters";
  if (file) {
    const name = file.name.toLowerCase();
    if (!ALLOWED_EXT.some((ext) => name.endsWith(ext))) e.file = "File must be PDF, DOCX, PNG or JPG";
    else if (file.size > MAX_FILE_BYTES) e.file = "File must be 10 MB or smaller";
  }
  return e;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function ErrorText({ id, children }: { id: string; children?: string }) {
  if (!children) return null;
  return (
    <p id={id} className="mt-1.5 flex items-center gap-1 text-sm text-red-600">
      <Icon name="alertCircle" className="size-3.5" />
      {children}
    </p>
  );
}

function Field(props: {
  label: string;
  error?: string;
  children: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={props.htmlFor} className="label">
        {props.label}
      </label>
      {props.children}
      {props.error ? (
        <ErrorText id={`${props.htmlFor}-error`}>{props.error}</ErrorText>
      ) : (
        props.hint && <p className="mt-1.5 text-xs text-slate-500">{props.hint}</p>
      )}
    </div>
  );
}

function Section(props: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="grid gap-x-6 gap-y-4 py-5 first:pt-0 last:pb-0 md:grid-cols-[10rem_1fr]">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{props.title}</h3>
        <p className="mt-0.5 text-xs leading-5 text-slate-500">{props.description}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{props.children}</div>
    </section>
  );
}

export function VendorForm({ vendor, onClose }: Props) {
  const id = useId();
  const qc = useQueryClient();
  const toast = useToast();
  const isEdit = Boolean(vendor);
  const fileInput = useRef<HTMLInputElement>(null);

  const [values, setValues] = useState<Values>({
    name: vendor?.name ?? "",
    start_date: vendor?.start_date ?? "",
    renewal_date: vendor?.renewal_date ?? "",
    cost: vendor?.cost ?? "",
    currency: vendor?.currency ?? "INR",
    nature_of_service: vendor?.nature_of_service ?? "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [removeAttachment, setRemoveAttachment] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [dragging, setDragging] = useState(false);

  const mutation = useMutation({
    mutationFn: (form: FormData) =>
      vendor ? updateVendor(vendor.id, form) : createVendor(form),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ["vendors"] });
      toast("success", `Vendor "${saved.name}" ${isEdit ? "updated" : "added"}.`);
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        if (err.status === 409) setErrors({ name: err.message });
        else if (err.status === 413) setErrors({ file: err.message });
        else if (Object.keys(err.fieldErrors).length) {
          const { _form, ...rest } = err.fieldErrors;
          setErrors(_form ? { renewal_date: _form, ...rest } : rest);
        } else toast("error", err.message);
      } else toast("error", "Something went wrong.");
    },
  });

  const set = (key: keyof Values) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const errs = validate(values, file);
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const form = new FormData();
    for (const [k, v] of Object.entries(values)) form.set(k, v.trim());
    form.set("currency", values.currency.trim().toUpperCase());
    if (file) form.set("file", file);
    if (isEdit && removeAttachment && !file) form.set("remove_attachment", "true");
    mutation.mutate(form);
  };

  const busy = mutation.isPending;

  const pickFile = (f: File | null) => {
    setFile(f);
    setErrors(({ file: _, ...rest }) => rest);
  };
  const clearFile = () => {
    pickFile(null);
    if (fileInput.current) fileInput.current.value = "";
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!busy && e.dataTransfer.files[0]) pickFile(e.dataTransfer.files[0]);
  };

  const fid = (name: string) => `${id}-${name}`;
  const aria = (name: string) => ({
    id: fid(name),
    "aria-invalid": Boolean(errors[name]),
    "aria-describedby": errors[name] ? `${fid(name)}-error` : undefined,
  });

  const existing = vendor?.attachment_filename;
  const existingStruck = removeAttachment || Boolean(file);

  return (
    <Modal
      title={isEdit ? "Edit vendor" : "Add vendor"}
      description={
        isEdit ? (
          <>
            Update the details for <span className="font-medium text-slate-700">{vendor!.name}</span>.
          </>
        ) : (
          "Record a new vendor contract and its renewal date."
        )
      }
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={onSubmit} noValidate>
        <fieldset disabled={busy} className="divide-y divide-slate-100 px-6 py-5">
          <Section title="Vendor" description="Who you're buying from and what for.">
            <div className="sm:col-span-2">
              <Field label="Vendor name" htmlFor={fid("name")} error={errors.name}>
                <input
                  {...aria("name")}
                  autoFocus
                  maxLength={200}
                  placeholder="e.g. Acme Cloud Services"
                  className="input"
                  value={values.name}
                  onChange={set("name")}
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field
                label="Nature of service"
                htmlFor={fid("nature_of_service")}
                error={errors.nature_of_service}
              >
                <input
                  {...aria("nature_of_service")}
                  list={fid("service-list")}
                  maxLength={200}
                  placeholder="e.g. SaaS, Cloud, Hardware…"
                  className="input"
                  value={values.nature_of_service}
                  onChange={set("nature_of_service")}
                />
                <datalist id={fid("service-list")}>
                  {SERVICE_SUGGESTIONS.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </Field>
              <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Common services">
                {SERVICE_SUGGESTIONS.map((s) => {
                  const selected = values.nature_of_service.trim().toLowerCase() === s.toLowerCase();
                  return (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setValues((v) => ({ ...v, nature_of_service: s }))}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition ring-inset focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none ${
                        selected
                          ? "bg-brand-50 text-brand-700 ring-brand-200"
                          : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
          </Section>

          <Section title="Contract" description="Term dates and what it costs.">
            <Field label="Start date" htmlFor={fid("start_date")} error={errors.start_date}>
              <input
                {...aria("start_date")}
                type="date"
                className="input"
                value={values.start_date}
                onChange={set("start_date")}
              />
            </Field>
            <Field label="Renewal date" htmlFor={fid("renewal_date")} error={errors.renewal_date}>
              <input
                {...aria("renewal_date")}
                type="date"
                min={values.start_date || undefined}
                className="input"
                value={values.renewal_date}
                onChange={set("renewal_date")}
              />
            </Field>

            <div className="sm:col-span-2">
              <label htmlFor={fid("cost")} className="label">
                Cost
              </label>
              <div className="flex">
                <input
                  {...aria("currency")}
                  aria-label="Currency"
                  list={fid("currency-list")}
                  maxLength={3}
                  className="input relative w-24 rounded-r-none uppercase focus:z-10"
                  value={values.currency}
                  onChange={set("currency")}
                />
                <datalist id={fid("currency-list")}>
                  {CURRENCY_SUGGESTIONS.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
                <input
                  {...aria("cost")}
                  inputMode="decimal"
                  placeholder="0.00"
                  className="input -ml-px rounded-l-none tabular-nums focus:z-10"
                  value={values.cost}
                  onChange={set("cost")}
                />
              </div>
              <ErrorText id={`${fid("currency")}-error`}>{errors.currency}</ErrorText>
              <ErrorText id={`${fid("cost")}-error`}>{errors.cost}</ErrorText>
            </div>
          </Section>

          <Section title="Agreement" description="Optional signed contract or PO.">
            <div className="sm:col-span-2">
              {existing && (
                <div
                  className={`mb-3 flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm ${
                    existingStruck ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-white"
                  }`}
                >
                  <span className="flex size-8 items-center justify-center rounded-md bg-slate-100 text-slate-500">
                    <Icon name="file" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate font-medium ${
                        existingStruck ? "text-slate-400 line-through" : "text-slate-800"
                      }`}
                    >
                      {existing}
                    </p>
                    <p className="text-xs text-slate-500">
                      {file
                        ? "Will be replaced by the new file"
                        : removeAttachment
                          ? "Will be removed when you save"
                          : "Current attachment"}
                    </p>
                  </div>
                  {!file && (
                    <button
                      type="button"
                      className={
                        removeAttachment
                          ? "btn-ghost h-8 px-2.5"
                          : "btn-ghost h-8 px-2.5 text-red-600 hover:bg-red-50 hover:text-red-700"
                      }
                      onClick={() => setRemoveAttachment((r) => !r)}
                    >
                      {removeAttachment ? "Undo" : "Remove"}
                    </button>
                  )}
                </div>
              )}

              {file ? (
                <div className="flex items-center gap-3 rounded-lg border border-brand-200 bg-brand-50/50 px-3 py-2.5 text-sm">
                  <span className="flex size-8 items-center justify-center rounded-md bg-brand-100 text-brand-700">
                    <Icon name="file" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-800">{file.name}</p>
                    <p className="text-xs text-slate-500">{formatBytes(file.size)}</p>
                  </div>
                  <button
                    type="button"
                    className="btn-icon"
                    onClick={clearFile}
                    aria-label="Remove selected file"
                  >
                    <Icon name="x" />
                  </button>
                </div>
              ) : (
                <label
                  htmlFor={fid("file")}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-4 py-6 text-center transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500 ${
                    dragging
                      ? "border-brand-400 bg-brand-50"
                      : errors.file
                        ? "border-red-300 bg-red-50/40"
                        : "border-slate-300 bg-slate-50/50 hover:border-slate-400 hover:bg-slate-50"
                  }`}
                >
                  <span className="mb-2 flex size-9 items-center justify-center rounded-full bg-white text-slate-500 shadow-xs ring-1 ring-slate-200">
                    <Icon name="upload" />
                  </span>
                  <span className="text-sm text-slate-700">
                    <span className="font-medium text-brand-700">
                      {existing ? "Upload a replacement" : "Click to upload"}
                    </span>{" "}
                    or drag and drop
                  </span>
                  <span className="mt-0.5 text-xs text-slate-500">PDF, DOCX, PNG or JPG · up to 10 MB</span>
                  <input
                    {...aria("file")}
                    ref={fileInput}
                    type="file"
                    accept={ALLOWED_EXT.join(",")}
                    className="sr-only"
                    onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              )}
              <ErrorText id={`${fid("file")}-error`}>{errors.file}</ErrorText>
            </div>
          </Section>
        </fieldset>

        <ModalFooter>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy && <Spinner className="size-4 border-white/40 border-t-white" />}
            {isEdit ? "Save changes" : "Add vendor"}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
