import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";

import { ApiError } from "../api/client";
import type { SortField, SortOrder, Vendor } from "../api/types";
import { deleteVendor, listVendors } from "../api/vendors";
import { AppHeader } from "../components/AppHeader";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Icon, type IconName } from "../components/Icon";
import { Spinner } from "../components/Spinner";
import { useToast } from "../components/Toast";
import { VendorForm } from "../components/VendorForm";
import { VendorTable, VendorTableSkeleton } from "../components/VendorTable";
import { daysUntil, formatDate, relativeDays } from "../lib/format";

const PAGE_SIZE = 20;
// The summary reads the earliest renewals in one request; counts beyond this show as "N+".
const SUMMARY_SIZE = 100;

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/**
 * Portfolio-wide renewal counts. Vendors sorted by renewal date put every overdue and
 * due-soon vendor first, so one page is exact unless that page is entirely within the window.
 */
function useRenewalSummary() {
  const query = useQuery({
    queryKey: ["vendors", "summary"],
    queryFn: () =>
      listVendors({
        search: "",
        sort: "renewal_date",
        order: "asc",
        page: 1,
        pageSize: SUMMARY_SIZE,
      }),
  });
  const data = query.data;
  if (!data) {
    // Loading, or the summary failed: show placeholders rather than misleading zeros.
    return { isPending: query.isPending, total: "—", overdue: 0, overdueLabel: "—", dueSoon: 0, dueSoonLabel: "—", next: undefined };
  }

  const days = data.items.map((v) => daysUntil(v.renewal_date));
  const overdue = days.filter((d) => d < 0).length;
  const dueSoon = days.filter((d) => d >= 0 && d <= 30).length;
  const truncated = data.total > data.items.length && days.at(-1)! <= 30;
  const next = data.items.find((v) => daysUntil(v.renewal_date) >= 0);
  const fmt = (n: number) => (truncated ? `${n}+` : String(n));

  return {
    isPending: false,
    total: String(data.total),
    overdue,
    overdueLabel: fmt(overdue),
    dueSoon,
    dueSoonLabel: fmt(dueSoon),
    next,
  };
}

function StatCard(props: {
  label: string;
  value: ReactNode;
  hint: ReactNode;
  icon: IconName;
  tone: "brand" | "amber" | "red" | "slate";
  loading?: boolean;
}) {
  const tones = {
    brand: "bg-brand-50 text-brand-600 ring-brand-600/10",
    amber: "bg-amber-50 text-amber-600 ring-amber-600/15",
    red: "bg-red-50 text-red-600 ring-red-600/10",
    slate: "bg-slate-100 text-slate-600 ring-slate-600/10",
  };
  return (
    <div className="card flex min-w-0 items-start justify-between gap-4 p-4 sm:p-5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-500">{props.label}</p>
        {props.loading ? (
          <div className="mt-2 h-8 w-16 animate-pulse rounded-md bg-slate-100" />
        ) : (
          <div className="mt-1 truncate text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
            {props.value}
          </div>
        )}
        <div className="mt-1 truncate text-xs text-slate-500">{props.loading ? " " : props.hint}</div>
      </div>
      <span
        className={`hidden size-10 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset sm:flex ${tones[props.tone]}`}
      >
        <Icon name={props.icon} className="size-5" />
      </span>
    </div>
  );
}

function EmptyState(props: { icon: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center border-t border-slate-200 px-6 py-16 text-center">
      <span className="mb-4 flex size-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500 ring-8 ring-slate-50">
        <Icon name={props.icon} className="size-6" />
      </span>
      <h3 className="text-sm font-semibold text-slate-900">{props.title}</h3>
      {props.children && <p className="mt-1 max-w-sm text-sm text-slate-500">{props.children}</p>}
      {props.action && <div className="mt-5">{props.action}</div>}
    </div>
  );
}

export function Vendors() {
  const toast = useToast();
  const qc = useQueryClient();
  const summary = useRenewalSummary();

  const [searchInput, setSearchInput] = useState("");
  const search = useDebounced(searchInput, 300);
  const [sort, setSort] = useState<SortField>("name");
  const [order, setOrder] = useState<SortOrder>("asc");
  const [page, setPage] = useState(1);

  const [editing, setEditing] = useState<Vendor | "new" | null>(null);
  const [deleting, setDeleting] = useState<Vendor | null>(null);

  useEffect(() => setPage(1), [search]);

  const params = { search, sort, order, page, pageSize: PAGE_SIZE };
  const query = useQuery({
    queryKey: ["vendors", params],
    queryFn: () => listVendors(params),
    placeholderData: keepPreviousData,
  });

  const totalPages = Math.max(1, Math.ceil((query.data?.total ?? 0) / PAGE_SIZE));
  // If the last item on a page was deleted, step back to a page that exists.
  useEffect(() => {
    if (query.data && page > totalPages) setPage(totalPages);
  }, [query.data, page, totalPages]);

  const del = useMutation({
    mutationFn: (v: Vendor) => deleteVendor(v.id),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["vendors"] });
      toast("success", `Vendor "${v.name}" deleted.`);
      setDeleting(null);
    },
    onError: (err) => {
      toast("error", err instanceof ApiError ? err.message : "Delete failed.");
      setDeleting(null);
    },
  });

  const onSort = (field: SortField) => {
    if (field === sort) setOrder(order === "asc" ? "desc" : "asc");
    else {
      setSort(field);
      setOrder("asc");
    }
    setPage(1);
  };

  const showRenewalsFirst = () => {
    setSort("renewal_date");
    setOrder("asc");
    setPage(1);
    setSearchInput("");
  };

  const data = query.data;
  const addButton = (
    <button type="button" className="btn-primary" onClick={() => setEditing("new")}>
      <Icon name="plus" />
      Add vendor
    </button>
  );

  return (
    <div className="min-h-screen">
      <AppHeader />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Vendors</h1>
            <p className="mt-1 text-sm text-slate-500">
              Track contracts, costs and upcoming renewals across all your suppliers.
            </p>
          </div>
          {addButton}
        </div>

        <section aria-label="Summary" className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <StatCard
            label="Total vendors"
            value={summary.total}
            hint="Active contracts on record"
            icon="building"
            tone="brand"
            loading={summary.isPending}
          />
          <StatCard
            label="Renewing in 30 days"
            value={summary.dueSoonLabel}
            hint={
              summary.dueSoon ? (
                <button
                  type="button"
                  onClick={showRenewalsFirst}
                  className="block max-w-full truncate font-medium text-amber-700 hover:text-amber-800 hover:underline"
                >
                  Review upcoming renewals →
                </button>
              ) : (
                "Nothing due this month"
              )
            }
            icon="calendarClock"
            tone="amber"
            loading={summary.isPending}
          />
          <StatCard
            label="Overdue renewals"
            value={summary.overdueLabel}
            hint={
              summary.overdue ? (
                <button
                  type="button"
                  onClick={showRenewalsFirst}
                  className="block max-w-full truncate font-medium text-red-700 hover:text-red-800 hover:underline"
                >
                  Review overdue vendors →
                </button>
              ) : (
                "All renewals are current"
              )
            }
            icon="alertTriangle"
            tone="red"
            loading={summary.isPending}
          />
          <StatCard
            label="Next renewal"
            value={
              summary.next ? (
                <span className="text-lg" title={summary.next.name}>
                  {summary.next.name}
                </span>
              ) : (
                <span className="text-slate-400">—</span>
              )
            }
            hint={
              summary.next
                ? `${formatDate(summary.next.renewal_date)} · ${relativeDays(summary.next.renewal_date)}`
                : "No upcoming renewals"
            }
            icon="clock"
            tone="slate"
            loading={summary.isPending}
          />
        </section>

        <section className="card overflow-hidden" aria-label="Vendor list">
          <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2.5">
              <h2 className="text-sm font-semibold text-slate-900">All vendors</h2>
              {data && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 tabular-nums">
                  {data.total}
                </span>
              )}
              {query.isFetching && !query.isPending && <Spinner className="size-3.5" />}
            </div>
            <div className="relative w-full sm:max-w-xs">
              <Icon
                name="search"
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
              />
              <input
                type="search"
                aria-label="Search vendors"
                placeholder="Search name or service…"
                className="input h-9 pl-9"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
          </div>

          {query.isPending ? (
            <VendorTableSkeleton />
          ) : query.isError ? (
            <EmptyState
              icon="alertCircle"
              title="Couldn’t load vendors"
              action={
                <button type="button" className="btn-secondary" onClick={() => query.refetch()}>
                  <Icon name="refresh" />
                  Try again
                </button>
              }
            >
              Something went wrong while fetching the vendor list. Check your connection and retry.
            </EmptyState>
          ) : data && data.items.length === 0 ? (
            search.trim() ? (
              <EmptyState
                icon="search"
                title="No matching vendors"
                action={
                  <button type="button" className="btn-secondary" onClick={() => setSearchInput("")}>
                    Clear search
                  </button>
                }
              >
                Nothing matches “{search.trim()}”. Try a different name or service.
              </EmptyState>
            ) : (
              <EmptyState
                icon="building"
                title="No vendors yet"
                action={
                  <button type="button" className="btn-primary" onClick={() => setEditing("new")}>
                    <Icon name="plus" />
                    Add your first vendor
                  </button>
                }
              >
                Add vendors to keep their contracts, costs and renewal dates in one place.
              </EmptyState>
            )
          ) : (
            data && (
              <>
                <div className={query.isFetching ? "opacity-60 transition-opacity" : "transition-opacity"}>
                  <VendorTable
                    vendors={data.items}
                    sort={sort}
                    order={order}
                    onSort={onSort}
                    onEdit={setEditing}
                    onDelete={setDeleting}
                  />
                </div>
                <nav
                  aria-label="Pagination"
                  className="flex items-center justify-between gap-4 border-t border-slate-200 px-5 py-3 text-sm text-slate-500"
                >
                  <span>
                    Showing{" "}
                    <span className="font-medium text-slate-900 tabular-nums">
                      {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data.total)}
                    </span>{" "}
                    of <span className="font-medium text-slate-900 tabular-nums">{data.total}</span>
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="hidden tabular-nums sm:inline">
                      Page {page} of {totalPages}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="btn-secondary size-9 px-0"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => p - 1)}
                        aria-label="Previous page"
                      >
                        <Icon name="chevronLeft" />
                      </button>
                      <button
                        type="button"
                        className="btn-secondary size-9 px-0"
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => p + 1)}
                        aria-label="Next page"
                      >
                        <Icon name="chevronRight" />
                      </button>
                    </div>
                  </div>
                </nav>
              </>
            )
          )}
        </section>
      </main>

      {editing && (
        <VendorForm
          key={editing === "new" ? "new" : editing.id}
          vendor={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete vendor?"
          message={
            <>
              <strong className="font-medium text-slate-900">{deleting.name}</strong> will be removed
              from the vendor list. This can’t be undone from the app.
            </>
          }
          confirmLabel="Delete vendor"
          busy={del.isPending}
          onConfirm={() => del.mutate(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
