"use client";

/**
 * AgroSim 2.0 — Settings.
 * Cleaner than the 1.0 framer-accordion version. Same data, lighter chrome.
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  User,
  MapPlus,
  Package,
  LogOut,
  ChevronRight,
  Plus,
  RotateCcw,
  Loader2,
  Mail,
  AlertTriangle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useFarmStore } from "@/stores/farmStore";

const DEMO_EMAIL = "demo@agrosim.app";

interface InventoryItem {
  id: string;
  item_name: string;
  current_quantity: number;
  unit: string;
  reorder_threshold: number | null;
}

export default function SettingsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { farm, farms } = useFarmStore();

  const [user, setUser] = useState<{ email: string } | null>(null);
  const [resolvedFarm, setResolvedFarm] = useState<{ id: string; name: string | null } | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user: u } }) => {
      if (!u) return;
      setUser({ email: u.email || "" });

      // Always load the user's primary farm fresh — Zustand may be stale or empty
      const { data: farmRow } = await supabase
        .from("farms")
        .select("id, name")
        .eq("user_id", u.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (farmRow) setResolvedFarm(farmRow);

      const farmId = farmRow?.id ?? farm?.id;
      if (farmId) {
        fetch(`/api/inventory?farm_id=${farmId}`)
          .then((r) => (r.ok ? r.json() : []))
          .then(setInventory)
          .catch(() => {});
      }
    });
  }, [supabase, farm?.id]);

  const displayFarmName = resolvedFarm?.name ?? farm?.name ?? "—";

  const isDemoUser = user?.email === DEMO_EMAIL;
  const lowStock = inventory.filter(
    (i) => i.reorder_threshold && i.current_quantity <= i.reorder_threshold
  );

  async function handleReset() {
    if (
      !confirm(
        "Reset all demo data back to the seeded baseline? Anything you've added since the last reset will be wiped."
      )
    )
      return;
    setResetting(true);
    setResetMsg(null);
    try {
      const res = await fetch("/api/demo/reset", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reset failed");
      setResetMsg(
        `Reset complete. ${data.seeded.plots} plots, ${data.seeded.inventoryItems} items, ${data.seeded.diagnoses} diagnoses, ${data.seeded.groupBuys} group buys, ${data.seeded.farmerSales} sales.`
      );
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      setResetMsg(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setResetting(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/");
  }

  return (
    <div className="min-h-screen bg-stone-50 pb-24">
      {/* Header */}
      <header className="border-b border-stone-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-xl items-center gap-2">
          <button onClick={() => router.back()} aria-label="Back">
            <ArrowLeft size={18} className="text-stone-500" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-stone-900">Settings</h1>
            <p className="text-[11px] text-stone-500 leading-none">
              Profile, farms, and demo controls
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-3 p-4">
        {/* Profile */}
        <Card>
          <CardRow
            icon={<User size={16} className="text-stone-500" />}
            label="Profile"
            value={user?.email ?? "Not signed in"}
            onClick={() => router.push("/profile")}
          />
        </Card>

        {/* Farm management */}
        <Card>
          <CardRow
            icon={<MapPlus size={16} className="text-blue-500" />}
            label="Current farm"
            value={displayFarmName}
            badge={farms.length > 1 ? `${farms.length} farms` : undefined}
          />
          <CardRow
            icon={<Plus size={16} className="text-stone-500" />}
            label="Add new farm"
            onClick={() => router.push("/onboarding")}
            chevron
          />
        </Card>

        {/* Inventory snapshot */}
        <Card>
          <CardRow
            icon={<Package size={16} className="text-purple-500" />}
            label="Inventory"
            value={`${inventory.length} ${inventory.length === 1 ? "item" : "items"}`}
            badge={
              lowStock.length > 0
                ? `${lowStock.length} low`
                : undefined
            }
            badgeTone={lowStock.length > 0 ? "danger" : undefined}
            onClick={() => router.push("/inventory")}
            chevron
          />
        </Card>

        {/* Demo controls — only visible for the demo user */}
        {isDemoUser && (
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="mb-1 flex items-center gap-2 text-amber-900">
              <RotateCcw size={14} />
              <span className="text-sm font-semibold">Demo controls</span>
            </div>
            <p className="text-[11px] text-amber-800">
              Wipes everything you&apos;ve added during this session and reseeds
              the baseline (1 farm, 2 plots, 3 inventory items, 2 diagnoses,
              3 sales, 2 group buys). Lets you login → test → reset → repeat.
            </p>
            <button
              onClick={handleReset}
              disabled={resetting}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-amber-700 disabled:opacity-50"
            >
              {resetting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RotateCcw size={14} />
              )}
              {resetting ? "Resetting…" : "Reset demo data"}
            </button>
            {resetMsg && (
              <p className="mt-2 break-words text-[11px] text-amber-900">
                {resetMsg}
              </p>
            )}
          </section>
        )}

        {/* Contact / about */}
        <Card>
          <CardRow
            icon={<Mail size={16} className="text-stone-500" />}
            label="Get in touch"
            value="teozenben05@gmail.com"
          />
        </Card>

        {/* Sign out */}
        <button
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-3 text-sm font-medium text-red-600 transition hover:bg-red-50"
        >
          <LogOut size={14} />
          Sign out
        </button>

        {!isDemoUser && user && (
          <p className="text-center text-[11px] text-stone-400">
            Demo controls only show for{" "}
            <span className="font-mono">{DEMO_EMAIL}</span>
          </p>
        )}

        {/* Footer */}
        <p className="pt-4 text-center text-[10px] text-stone-400">
          AgroSim 2.0 · Project 2030: MyAI Future Hackathon
        </p>
      </main>
    </div>
  );
}

// ── Small reusable Card ──

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-stone-200 bg-white">
      <div className="divide-y divide-stone-100">{children}</div>
    </section>
  );
}

function CardRow({
  icon,
  label,
  value,
  badge,
  badgeTone,
  onClick,
  chevron,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  badge?: string;
  badgeTone?: "danger";
  onClick?: () => void;
  chevron?: boolean;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${
        onClick ? "hover:bg-stone-50" : ""
      }`}
    >
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-stone-50">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-stone-800">{label}</p>
        {value && (
          <p className="truncate text-[11px] text-stone-500">{value}</p>
        )}
      </div>
      {badge && (
        <span
          className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
            badgeTone === "danger"
              ? "bg-red-50 text-red-700"
              : "bg-stone-100 text-stone-600"
          }`}
        >
          {badge}
        </span>
      )}
      {chevron && (
        <ChevronRight size={14} className="flex-shrink-0 text-stone-300" />
      )}
      {/* Suppress unused-import warning for AlertTriangle (left for future use) */}
      {false && <AlertTriangle size={0} />}
    </Comp>
  );
}
