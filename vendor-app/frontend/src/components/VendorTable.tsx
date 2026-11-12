import { attachmentUrl } from "../api/vendors";
import type { SortField, SortOrder, Vendor } from "../api/types";
import {
  formatCost,
  formatDate,
  initials,
  relativeDays,
  renewalStatus,
  type RenewalStatus,
} from "../lib/format";
import { Icon } from "./Icon";

interface Props {
  vendors: Vendor[];
  sort: SortField;
  order: SortOrder;
  onSort: (field: SortField) => void;
  onEdit: (v: Vendor) => void;
  onDelete: (v: Vendor) => void;
}

const ROW_STYLE: Record<RenewalStatus, string> = {
  overdue: "bg-red-50/40 hover:bg-red-50/80",
  "due-soon": "bg-amber-50/40 hover:bg-amber-50/80",
  ok: "hover:bg-slate-50/80",
};

// Colored bar on the row's leading edge, so status reads at a glance down the list.
const ROW_ACCENT: Record<RenewalStatus, string> = {
  overdue: "shadow-[inset_3px_0_0_var(--color-red-500)]",
  "due-soon": "shadow-[inset_3px_0_0_var(--color-amber-400)]",
  ok: "",
};

const STATUS_PILL: Record<RenewalStatus, string> = {
  overdue: "bg-red-50 text-red-700 ring-red-600/15",
  "due-soon": "bg-amber-50 text-amber-800 ring-amber-600/20",
  ok: "",
};

const STATUS_DOT: Record<RenewalStatus, string> = {
  overdue: "bg-red-500",
  "due-soon": "bg-amber-500",
  ok: "",
};

const AVATAR_COLORS = [
  "bg-brand-50 text-brand-700 ring-brand-600/10",
  "bg-emerald-50 text-emerald-700 ring-emerald-600/10",
  "bg-violet-50 text-violet-700 ring-violet-600/10",
  "bg-sky-50 text-sky-700 ring-sky-600/10",
  "bg-rose-50 text-rose-700 ring-rose-600/10",
  "bg-teal-50 text-teal-700 ring-teal-600/10",
  "bg-orange-50 text-orange-700 ring-orange-600/10",
  "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-600/10",
];

function avatarColor(name: string): string {
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

const TH = "px-4 py-3 text-xs font-medium tracking-wide text-slate-500 uppercase";

function SortHeader(props: {
  field: SortField;
  label: string;
  sort: SortField;
  order: SortOrder;
  onSort: (f: SortField) => void;
  align?: "right";
}) {
  const active = props.sort === props.field;
  return (
    <th
      scope="col"
      aria-sort={active ? (props.order === "asc" ? "ascending" : "descending") : "none"}
      className={`${TH} ${props.align === "right" ? "text-right" : "text-left"}`}
    >
      <button
        type="button"
        onClick={() => props.onSort(props.field)}
        className={`group inline-flex items-center gap-1.5 rounded uppercase hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none ${
          active ? "text-slate-900" : ""
        } ${props.align === "right" ? "flex-row-reverse" : ""}`}
      >
        {props.label}
        <Icon
          name={active ? (props.order === "asc" ? "arrowUp" : "arrowDown") : "arrowUpDown"}
          className={`size-3.5 ${
            active ? "text-brand-600" : "text-slate-300 group-hover:text-slate-400"
          }`}
        />
      </button>
    </th>
  );
}

export function VendorTable({ vendors, sort, order, onSort, onEdit, onDelete }: Props) {
  const sortProps = { sort, order, onSort };
  return (
    // `relative` keeps the absolutely positioned sr-only header inside the scroll area.
    <div className="relative overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="border-y border-slate-200 bg-slate-50/80">
          <tr>
            <SortHeader field="name" label="Vendor" {...sortProps} />
            <SortHeader field="nature_of_service" label="Service" {...sortProps} />
            <SortHeader field="start_date" label="Start date" {...sortProps} />
            <SortHeader field="renewal_date" label="Renewal" {...sortProps} />
            <SortHeader field="cost" label="Cost" align="right" {...sortProps} />
            <th scope="col" className={`${TH} text-left`}>
              Agreement
            </th>
            <th scope="col" className={`${TH} text-right`}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {vendors.map((v) => {
            const status = renewalStatus(v.renewal_date);
            return (
              <tr
                key={v.id}
                className={`group/row transition-colors ${ROW_STYLE[status]}`}
                data-renewal={status}
              >
                <td className={`py-3 pr-4 pl-5 ${ROW_ACCENT[status]}`}>
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className={`flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold ring-1 ring-inset ${avatarColor(v.name)}`}
                    >
                      {initials(v.name)}
                    </span>
                    <span className="max-w-64 truncate font-medium text-slate-900" title={v.name}>
                      {v.name}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className="inline-block max-w-48 truncate rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200/70 ring-inset"
                    title={v.nature_of_service}
                  >
                    {v.nature_of_service}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                  {formatDate(v.start_date)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="text-slate-900">{formatDate(v.renewal_date)}</div>
                  {status === "ok" ? (
                    <div className="mt-0.5 text-xs text-slate-500">
                      {relativeDays(v.renewal_date)}
                    </div>
                  ) : (
                    <span
                      className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_PILL[status]}`}
                    >
                      <span className={`size-1.5 rounded-full ${STATUS_DOT[status]}`} />
                      {relativeDays(v.renewal_date)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-medium whitespace-nowrap text-slate-900 tabular-nums">
                  {formatCost(v.cost, v.currency)}
                </td>
                <td className="px-4 py-3">
                  {v.attachment_filename ? (
                    <a
                      href={attachmentUrl(v.id)}
                      className="group/file inline-flex max-w-52 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-xs transition hover:border-brand-300 hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
                      title={`Download ${v.attachment_filename}`}
                    >
                      <Icon
                        name="paperclip"
                        className="size-3.5 text-slate-400 group-hover/file:text-brand-600"
                      />
                      <span className="truncate">{v.attachment_filename}</span>
                    </a>
                  ) : (
                    <span className="text-xs text-slate-400">No file</span>
                  )}
                </td>
                <td className="py-3 pr-4 pl-2 text-right whitespace-nowrap">
                  <div className="inline-flex items-center gap-0.5 opacity-70 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100">
                    <button
                      type="button"
                      className="btn-icon"
                      onClick={() => onEdit(v)}
                      aria-label={`Edit ${v.name}`}
                      title="Edit"
                    >
                      <Icon name="pencil" />
                    </button>
                    <button
                      type="button"
                      className="btn-icon hover:bg-red-50 hover:text-red-600"
                      onClick={() => onDelete(v)}
                      aria-label={`Delete ${v.name}`}
                      title="Delete"
                    >
                      <Icon name="trash" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Placeholder rows shown while the first page loads. */
export function VendorTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading vendors" className="border-t border-slate-200">
      <div className="h-11 border-b border-slate-200 bg-slate-50/80" />
      <ul className="divide-y divide-slate-100">
        {Array.from({ length: rows }, (_, i) => (
          <li key={i} className="flex animate-pulse items-center gap-4 px-5 py-4">
            <span className="size-9 rounded-lg bg-slate-100" />
            <span className="h-3 w-40 rounded bg-slate-100" />
            <span className="ml-auto hidden h-3 w-20 rounded bg-slate-100 sm:block" />
            <span className="hidden h-3 w-24 rounded bg-slate-100 md:block" />
            <span className="hidden h-3 w-24 rounded bg-slate-100 md:block" />
            <span className="h-3 w-16 rounded bg-slate-100" />
          </li>
        ))}
      </ul>
    </div>
  );
}
