// ── Contacts ──
export interface Customer {
  id: string;
  farm_id: string;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  total_outstanding_rm: number;
  created_at: string;
}

export interface Supplier {
  id: string;
  farm_id: string;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
}

// ── Line Items (shared across all documents) ──
export interface DocumentItem {
  id: string;
  document_id: string;
  document_type: string;
  item_name: string;
  description: string | null;
  quantity: number;
  unit: string;
  unit_price_rm: number;
  total_rm: number;
  inventory_item_id: string | null;
}

// ── Purchase Side ──
export interface PurchaseRFQ {
  id: string;
  farm_id: string;
  supplier_id: string | null;
  rfq_number: string;
  rfq_date: string;
  status: "draft" | "sent" | "quoted" | "converted" | "cancelled";
  notes: string | null;
  total_rm: number;
  created_at: string;
  items?: DocumentItem[];
  supplier?: Supplier;
}

export interface PurchaseOrder {
  id: string;
  farm_id: string;
  supplier_id: string | null;
  rfq_id: string | null;
  po_number: string;
  po_date: string;
  status: "draft" | "confirmed" | "partial" | "received" | "cancelled";
  total_rm: number;
  created_at: string;
  items?: DocumentItem[];
  supplier?: Supplier;
}

export interface GoodsReceivedNote {
  id: string;
  farm_id: string;
  po_id: string | null;
  supplier_id: string | null;
  grn_number: string;
  grn_date: string;
  received_by: string | null;
  notes: string | null;
  total_rm: number;
  created_at: string;
  items?: DocumentItem[];
  supplier?: Supplier;
}

export interface PurchaseInvoice {
  id: string;
  farm_id: string;
  supplier_id: string | null;
  po_id: string | null;
  grn_id: string | null;
  bill_number: string;
  bill_date: string;
  due_date: string | null;
  status: "unpaid" | "partial" | "paid";
  total_rm: number;
  paid_rm: number;
  created_at: string;
  items?: DocumentItem[];
  supplier?: Supplier;
}

// ── Sales Side ──
export interface SalesQuotation {
  id: string;
  farm_id: string;
  customer_id: string | null;
  qt_number: string;
  qt_date: string;
  valid_until: string | null;
  status: "draft" | "sent" | "accepted" | "rejected" | "converted";
  total_rm: number;
  created_at: string;
  items?: DocumentItem[];
  customer?: Customer;
}

export interface SalesOrder {
  id: string;
  farm_id: string;
  customer_id: string | null;
  quotation_id: string | null;
  so_number: string;
  so_date: string;
  status: "draft" | "confirmed" | "partial" | "fulfilled" | "cancelled";
  total_rm: number;
  created_at: string;
  items?: DocumentItem[];
  customer?: Customer;
}

export interface DeliveryOrder {
  id: string;
  farm_id: string;
  customer_id: string | null;
  so_id: string | null;
  do_number: string;
  do_date: string;
  status: "draft" | "delivered" | "returned";
  total_rm: number;
  created_at: string;
  items?: DocumentItem[];
  customer?: Customer;
}

export interface SalesInvoice {
  id: string;
  farm_id: string;
  customer_id: string | null;
  so_id: string | null;
  do_id: string | null;
  inv_number: string;
  inv_date: string;
  due_date: string | null;
  status: "unpaid" | "partial" | "paid";
  total_rm: number;
  paid_rm: number;
  created_at: string;
  items?: DocumentItem[];
  customer?: Customer;
}

// ── Payment ──
export interface Payment {
  id: string;
  farm_id: string;
  document_type: "sales_invoice" | "purchase_invoice";
  document_id: string;
  amount_rm: number;
  payment_method: string;
  payment_date: string;
  reference: string | null;
  notes: string | null;
  created_at: string;
}

// ── Helpers ──
export type DocumentStatus = "draft" | "sent" | "confirmed" | "partial" | "fulfilled" | "received" | "delivered" | "cancelled" | "unpaid" | "paid" | "quoted" | "accepted" | "rejected" | "converted" | "returned";

export const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-gray-100 text-gray-600" },
  sent: { label: "Sent", cls: "bg-blue-50 text-blue-600" },
  quoted: { label: "Quoted", cls: "bg-violet-50 text-violet-600" },
  confirmed: { label: "Confirmed", cls: "bg-green-50 text-green-600" },
  partial: { label: "Partial", cls: "bg-amber-50 text-amber-600" },
  fulfilled: { label: "Fulfilled", cls: "bg-green-50 text-green-700" },
  received: { label: "Received", cls: "bg-green-50 text-green-700" },
  delivered: { label: "Delivered", cls: "bg-green-50 text-green-700" },
  cancelled: { label: "Cancelled", cls: "bg-red-50 text-red-500" },
  converted: { label: "Converted", cls: "bg-indigo-50 text-indigo-600" },
  accepted: { label: "Accepted", cls: "bg-green-50 text-green-600" },
  rejected: { label: "Rejected", cls: "bg-red-50 text-red-500" },
  returned: { label: "Returned", cls: "bg-red-50 text-red-500" },
  unpaid: { label: "Unpaid", cls: "bg-amber-50 text-amber-600" },
  paid: { label: "Paid", cls: "bg-green-50 text-green-700" },
};
