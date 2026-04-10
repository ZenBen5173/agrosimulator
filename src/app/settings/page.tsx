"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  User,
  MapPlus,
  PenLine,
  Package,
  Wrench,
  Bell,
  Download,
  LogOut,
  ChevronRight,
  Plus,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useFarmStore } from "@/stores/farmStore";
import PageHeader from "@/components/ui/PageHeader";

interface InventoryItem {
  id: string;
  item_name: string;
  item_type: string;
  current_quantity: number;
  unit: string;
  reorder_threshold: number | null;
}

interface EquipmentItem {
  id: string;
  name: string;
  category: string;
  condition: string;
  current_book_value_rm: number;
  monthly_depreciation_rm: number;
  service_overdue: boolean;
}

export default function SettingsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { farm, farms } = useFarmStore();

  const [user, setUser] = useState<{ email: string } | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [equipment, setEquipment] = useState<EquipmentItem[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      if (u) setUser({ email: u.email || "" });
    });

    if (farm?.id) {
      fetch(`/api/inventory?farm_id=${farm.id}`).then((r) => r.ok ? r.json() : []).then(setInventory).catch(() => {});
      fetch(`/api/equipment?farm_id=${farm.id}`).then((r) => r.ok ? r.json() : []).then(setEquipment).catch(() => {});
    }
  }, [farm?.id, supabase.auth]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/");
  };

  const toggle = (key: string) => setExpanded(expanded === key ? null : key);

  const lowStock = inventory.filter((i) => i.reorder_threshold && i.current_quantity <= i.reorder_threshold);
  const serviceOverdue = equipment.filter((e) => e.service_overdue);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <PageHeader title="Settings" />

      <div className="px-4 pt-4 space-y-3">
        {/* Profile */}
        <Section
          icon={<User size={18} className="text-gray-500" />}
          title="Profile"
          expanded={expanded === "profile"}
          onToggle={() => toggle("profile")}
        >
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Email</span>
              <span className="text-gray-700">{user?.email || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Farm</span>
              <span className="text-gray-700">{farm?.name || "My Farm"}</span>
            </div>
          </div>
        </Section>

        {/* Farm Management */}
        <Section
          icon={<MapPlus size={18} className="text-blue-500" />}
          title="Farm Management"
          badge={farms.length > 1 ? `${farms.length} farms` : undefined}
          expanded={expanded === "farms"}
          onToggle={() => toggle("farms")}
        >
          <div className="space-y-2">
            <button onClick={() => router.push("/onboarding")} className="w-full flex items-center gap-3 rounded-lg bg-blue-50 px-3 py-2.5 text-sm text-blue-700 font-medium">
              <Plus size={16} /> Add New Farm
            </button>
            <button onClick={() => router.push("/farm/redraw")} className="w-full flex items-center gap-3 rounded-lg bg-gray-100 px-3 py-2.5 text-sm text-gray-700 font-medium">
              <PenLine size={16} /> Edit Farm Boundary
            </button>
          </div>
        </Section>

        {/* Inventory */}
        <Section
          icon={<Package size={18} className="text-purple-500" />}
          title="Inventory"
          badge={lowStock.length > 0 ? `${lowStock.length} low` : `${inventory.length} items`}
          badgeColor={lowStock.length > 0 ? "text-red-600 bg-red-50" : undefined}
          expanded={expanded === "inventory"}
          onToggle={() => toggle("inventory")}
        >
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {inventory.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">No inventory items yet</p>
            ) : inventory.map((item) => {
              const isLow = item.reorder_threshold && item.current_quantity <= item.reorder_threshold;
              return (
                <div key={item.id} className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-gray-700">{item.item_name}</span>
                  <span className={isLow ? "text-red-500 font-medium" : "text-gray-500"}>
                    {item.current_quantity} {item.unit}
                  </span>
                </div>
              );
            })}
          </div>
          <button onClick={() => router.push("/inventory")} className="mt-2 text-xs text-purple-600 font-medium">
            Manage inventory &rarr;
          </button>
        </Section>

        {/* Equipment */}
        <Section
          icon={<Wrench size={18} className="text-amber-500" />}
          title="Equipment"
          badge={serviceOverdue.length > 0 ? `${serviceOverdue.length} overdue` : `${equipment.length} items`}
          badgeColor={serviceOverdue.length > 0 ? "text-red-600 bg-red-50" : undefined}
          expanded={expanded === "equipment"}
          onToggle={() => toggle("equipment")}
        >
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {equipment.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">No equipment tracked yet</p>
            ) : equipment.map((eq) => (
              <div key={eq.id} className="flex items-center justify-between py-1.5 text-sm">
                <div>
                  <span className="text-gray-700">{eq.name}</span>
                  {eq.service_overdue && <span className="ml-1 text-[10px] text-red-500">overdue</span>}
                </div>
                <span className="text-gray-500">RM{eq.current_book_value_rm?.toFixed(0) || "0"}</span>
              </div>
            ))}
          </div>
          <button onClick={() => router.push("/equipment")} className="mt-2 text-xs text-amber-600 font-medium">
            Manage equipment &rarr;
          </button>
        </Section>

        {/* Notifications */}
        <button onClick={() => router.push("/alerts")} className="w-full rounded-xl bg-white border border-gray-100 px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bell size={18} className="text-gray-500" />
            <span className="text-sm font-medium text-gray-800">Notifications & Alerts</span>
          </div>
          <ChevronRight size={16} className="text-gray-400" />
        </button>

        {/* Data Export */}
        <button onClick={() => router.push("/profile")} className="w-full rounded-xl bg-white border border-gray-100 px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Download size={18} className="text-gray-500" />
            <span className="text-sm font-medium text-gray-800">Data Export & Profile</span>
          </div>
          <ChevronRight size={16} className="text-gray-400" />
        </button>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full rounded-xl bg-white border border-red-100 px-4 py-3.5 flex items-center justify-center gap-2 text-red-500 font-medium text-sm"
        >
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
    </div>
  );
}

// ── Collapsible Section Component ──
function Section({
  icon, title, badge, badgeColor, expanded, onToggle, children,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: string;
  badgeColor?: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-white border border-gray-100 overflow-hidden">
      <button onClick={onToggle} className="w-full px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {icon}
          <span className="text-sm font-medium text-gray-800">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          {badge && (
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${badgeColor || "text-gray-500 bg-gray-100"}`}>
              {badge}
            </span>
          )}
          <motion.div animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: 0.15 }}>
            <ChevronRight size={16} className="text-gray-400" />
          </motion.div>
        </div>
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-gray-100 px-4 pb-4 pt-3"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
