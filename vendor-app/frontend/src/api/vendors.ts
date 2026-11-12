import { api } from "./client";
import type { Vendor, VendorListParams, VendorPage } from "./types";

export function listVendors(p: VendorListParams): Promise<VendorPage> {
  const qs = new URLSearchParams({
    sort: p.sort,
    order: p.order,
    page: String(p.page),
    page_size: String(p.pageSize),
  });
  if (p.search.trim()) qs.set("search", p.search.trim());
  return api(`/vendors?${qs}`);
}

export function createVendor(form: FormData): Promise<Vendor> {
  return api("/vendors", { method: "POST", body: form });
}

export function updateVendor(id: string, form: FormData): Promise<Vendor> {
  return api(`/vendors/${id}`, { method: "PUT", body: form });
}

export function deleteVendor(id: string): Promise<void> {
  return api(`/vendors/${id}`, { method: "DELETE" });
}

export function attachmentUrl(id: string): string {
  return `/api/vendors/${id}/attachment`;
}
