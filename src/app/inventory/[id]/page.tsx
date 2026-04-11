"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import { createClient } from "@/lib/supabase/client";

interface InventoryItem {
  id: string;
  item_name: string;
  item_type: string;
  current_quantity: number;
  unit: string;
  reorder_threshold: number | null;
  reorder_quantity: number | null;
  last_purchase_price_rm: number | null;
  supplier_name: string | null;
  created_at: string;
  updated_at: string;
}

interface Movement {
  id: string;
  movement_type: string;
  quantity: number;
  unit: string;
  notes: string | null;
  created_at: string;
}

interface PurchaseRecord {
  bill_date: string;
  quantity: number;
  unit: string;
  unit_price_rm: number;
  total_rm: number;
  supplier: string | null;
  doc_number: string;
}

export default function InventoryDetailPage() {
  const params = useParams();
  const itemId = params.id as string;

  const [item, setItem] = useState<InventoryItem | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const supabase = createClient();

      // Item details
      const { data: itemData } = await supabase
        .from("inventory_items")
        .select("*")
        .eq("id", itemId)
        .single();

      if (!itemData) { setLoading(false); return; }
      setItem(itemData);

      // Movement history (ins and outs)
      const { data: movs } = await supabase
        .from("inventory_movements")
        .select("id, movement_type, quantity, unit, notes, created_at")
        .eq("item_id", itemId)
        .order("created_at", { ascending: false })
        .limit(30);

      setMovements(movs || []);

      // Purchase history from document_items (find matching purchases)
      const { data: docItems } = await supabase
        .from("document_items")
        .select("quantity, unit, unit_price_rm, total_rm, document_id, document_type, created_at")
        .ilike("item_name", `%${itemData.item_name.split(" (")[0].split(" ").slice(0, 2).join(" ")}%`)
        .in("document_type", ["grn", "purchase_order", "purchase_invoice"])
        .order("created_at", { ascending: false })
        .limit(10);

      const purchaseRecords: PurchaseRecord[] = [];
      for (const di of docItems || []) {
        // Get parent document for date and supplier
        let docDate = di.created_at?.split("T")[0] || "";
        let supplier: string | null = null;
        let docNumber = "";

        if (di.document_type === "purchase_invoice") {
          const { data: bill } = await supabase.from("purchase_invoices").select("bill_date, bill_number, suppliers(name)").eq("id", di.document_id).single();
          if (bill) {
            docDate = bill.bill_date;
            docNumber = bill.bill_number;
            supplier = ((bill as Record<string, unknown>).suppliers as { name: string } | null)?.name || null;
          }
        } else if (di.document_type === "purchase_order") {
          const { data: po } = await supabase.from("purchase_orders").select("po_date, po_number, suppliers(name)").eq("id", di.document_id).single();
          if (po) {
            docDate = po.po_date;
            docNumber = po.po_number;
            supplier = ((po as Record<string, unknown>).suppliers as { name: string } | null)?.name || null;
          }
        } else if (di.document_type === "grn") {
          const { data: grn } = await supabase.from("goods_received_notes").select("grn_date, grn_number, suppliers(name)").eq("id", di.document_id).single();
          if (grn) {
            docDate = grn.grn_date;
            docNumber = grn.grn_number;
            supplier = ((grn as Record<string, unknown>).suppliers as { name: string } | null)?.name || null;
          }
        }

        purchaseRecords.push({
          bill_date: docDate,
          quantity: di.quantity,
          unit: di.unit,
          unit_price_rm: di.unit_price_rm,
          total_rm: di.total_rm,
          supplier,
          doc_number: docNumber,
        });
      }

      setPurchases(purchaseRecords);
      setLoading(false);
    }
    fetch();
  }, [itemId]);

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "2-digit" });
  };

  const formatTime = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString("en-MY", { day: "numeric", month: "short" }) + " " + date.toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit", hour12: true });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <PageHeader title="Item Detail" breadcrumbs={[{ label: "Accounts", href: "/dashboard" }, { label: "Inventory", href: "/inventory" }, { label: "..." }]} />
        <div className="px-4 pt-4 space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />)}</div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="min-h-screen bg-gray-50">
        <PageHeader title="Item Not Found" breadcrumbs={[{ label: "Accounts", href: "/dashboard" }, { label: "Inventory", href: "/inventory" }]} />
        <div className="px-4 pt-12 text-center text-sm text-gray-400">Item not found</div>
      </div>
    );
  }

  const isLow = item.reorder_threshold && item.current_quantity <= item.reorder_threshold;
  const totalIn = Math.round(movements.filter((m) => m.movement_type === "purchase" || m.movement_type === "adjustment").reduce((s, m) => s + m.quantity, 0) * 100) / 100;
  const totalOut = Math.round(movements.filter((m) => m.movement_type === "usage" || m.movement_type === "wastage").reduce((s, m) => s + m.quantity, 0) * 100) / 100;

  // Running balance for movements
  let balance = item.current_quantity;
  const movementsWithBalance = movements.map((m) => {
    const row = { ...m, balance: Math.round(balance * 100) / 100 };
    if (m.movement_type === "purchase" || m.movement_type === "adjustment") {
      balance -= m.quantity;
    } else {
      balance += m.quantity;
    }
    return row;
  });

  // Price history from purchases
  const avgPrice = purchases.length > 0
    ? purchases.reduce((s, p) => s + p.unit_price_rm, 0) / purchases.length
    : item.last_purchase_price_rm || 0;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <PageHeader
        title={item.item_name}
        breadcrumbs={[{ label: "Accounts", href: "/dashboard" }, { label: "Inventory", href: "/inventory" }, { label: item.item_name.split(" (")[0] }]}
      />

      <div className="px-4 pt-3 space-y-3">

        {/* Current stock header */}
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="grid grid-cols-3 divide-x divide-gray-100">
            <div className="px-3 py-3 text-center">
              <p className="text-[10px] text-gray-400">Current Stock</p>
              <p className={`text-lg font-bold mt-0.5 ${isLow ? "text-red-500" : "text-gray-900"}`}>{item.current_quantity}</p>
              <p className="text-[10px] text-gray-400">{item.unit}</p>
            </div>
            <div className="px-3 py-3 text-center">
              <p className="text-[10px] text-gray-400">Total In</p>
              <p className="text-sm font-bold text-green-600 mt-0.5">+{totalIn} {item.unit}</p>
            </div>
            <div className="px-3 py-3 text-center">
              <p className="text-[10px] text-gray-400">Total Out</p>
              <p className="text-sm font-bold text-red-500 mt-0.5">-{totalOut} {item.unit}</p>
            </div>
          </div>
        </div>

        {/* Item details */}
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Details</span>
          </div>
          <div className="divide-y divide-gray-50">
            <div className="flex justify-between px-3 py-2 text-xs"><span className="text-gray-400">Type</span><span className="text-gray-700 capitalize">{item.item_type}</span></div>
            <div className="flex justify-between px-3 py-2 text-xs"><span className="text-gray-400">Last Price</span><span className="text-gray-700">{item.last_purchase_price_rm ? `RM${item.last_purchase_price_rm.toFixed(2)}/${item.unit}` : "—"}</span></div>
            <div className="flex justify-between px-3 py-2 text-xs"><span className="text-gray-400">Avg Price</span><span className="text-gray-700">RM{avgPrice.toFixed(2)}/{item.unit}</span></div>
            {item.reorder_threshold && <div className="flex justify-between px-3 py-2 text-xs"><span className="text-gray-400">Reorder Level</span><span className={isLow ? "text-red-500 font-medium" : "text-gray-700"}>{item.reorder_threshold} {item.unit}</span></div>}
            {item.supplier_name && <div className="flex justify-between px-3 py-2 text-xs"><span className="text-gray-400">Supplier</span><span className="text-gray-700">{item.supplier_name}</span></div>}
          </div>
        </div>

        {/* Purchase history */}
        {purchases.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-100">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Purchase History</span>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-gray-400 border-b border-gray-50">
                  <th className="text-left font-medium px-3 py-1.5">Date</th>
                  <th className="text-left font-medium px-2 py-1.5">Doc</th>
                  <th className="text-right font-medium px-2 py-1.5">Qty</th>
                  <th className="text-right font-medium px-2 py-1.5">Price</th>
                  <th className="text-right font-medium px-3 py-1.5">Total</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((p, i) => (
                  <tr key={i} className="border-b border-gray-50 last:border-0">
                    <td className="px-3 py-2 text-gray-500">{formatDate(p.bill_date)}</td>
                    <td className="px-2 py-2 text-gray-700 font-medium">{p.doc_number || "—"}</td>
                    <td className="px-2 py-2 text-right text-gray-700">{p.quantity} {p.unit}</td>
                    <td className="px-2 py-2 text-right text-gray-500">RM{p.unit_price_rm.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-medium text-gray-800">RM{p.total_rm.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Stock movements (ins and outs with running balance) */}
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Stock Movements</span>
            <span className="text-[10px] text-gray-400">{movements.length} records</span>
          </div>
          {movements.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-gray-400">No stock movements recorded</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-gray-400 border-b border-gray-50">
                  <th className="text-left font-medium px-3 py-1.5">Date</th>
                  <th className="text-left font-medium px-2 py-1.5">Type</th>
                  <th className="text-right font-medium px-2 py-1.5">Qty</th>
                  <th className="text-right font-medium px-3 py-1.5">Balance</th>
                </tr>
              </thead>
              <tbody>
                {movementsWithBalance.map((m) => {
                  const isIn = m.movement_type === "purchase" || m.movement_type === "adjustment";
                  return (
                    <tr key={m.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-3 py-2 text-gray-500">{formatTime(m.created_at)}</td>
                      <td className="px-2 py-2">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${isIn ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"}`}>
                          {m.movement_type}
                        </span>
                      </td>
                      <td className={`px-2 py-2 text-right font-medium ${isIn ? "text-green-600" : "text-red-500"}`}>
                        {isIn ? "+" : "-"}{m.quantity} {m.unit}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">{m.balance.toFixed(1)} {item.unit}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
