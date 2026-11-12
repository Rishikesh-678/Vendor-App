export interface User {
  id: string;
  username: string;
  is_admin: boolean;
}

export interface Vendor {
  id: string;
  name: string;
  start_date: string; // YYYY-MM-DD
  renewal_date: string; // YYYY-MM-DD
  cost: string; // decimal as string, e.g. "120000.00"
  currency: string;
  nature_of_service: string;
  attachment_filename: string | null;
  created_at: string;
  updated_at: string;
}

export interface VendorPage {
  items: Vendor[];
  total: number;
  page: number;
  page_size: number;
}

export type SortField = "name" | "start_date" | "renewal_date" | "cost" | "nature_of_service";
export type SortOrder = "asc" | "desc";

export interface VendorListParams {
  search: string;
  sort: SortField;
  order: SortOrder;
  page: number;
  pageSize: number;
}
