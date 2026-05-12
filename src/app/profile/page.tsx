"use client";

/**
 * AgroSim 2.0 — Profile page.
 * Clean rewrite: avatar + identity, farm summary, notification toggles,
 * sign out. Lighter than the 1.0 version (drops the referral history
 * since 2.0 escalation lives in the diagnosis flow itself).
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Sprout,
  Droplets,
  Ruler,
  Bell,
  Pencil,
  Check,
  X,
  LogOut,
  Loader2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";

interface ProfileData {
  full_name: string | null;
  phone: string | null;
  district: string | null;
  state: string | null;
}

interface FarmData {
  id: string;
  name: string | null;
  area_acres: number;
  soil_type: string | null;
  water_source: string | null;
}

interface Preferences {
  weather_alerts: boolean;
  harvest_reminders: boolean;
  task_reminders: boolean;
}

function initials(name: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export default function ProfilePage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [farm, setFarm] = useState<FarmData | null>(null);
  const [prefs, setPrefs] = useState<Preferences>({
    weather_alerts: true,
    harvest_reminders: true,
    task_reminders: true,
  });

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ProfileData>({
    full_name: "",
    phone: "",
    district: "",
    state: "",
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user: u },
      } = await supabase.auth.getUser();
      if (!u) {
        router.replace("/");
        return;
      }
      setUser({ id: u.id, email: u.email ?? "" });

      const { data: p } = await supabase
        .from("profiles")
        .select("full_name, phone, district, state")
        .eq("id", u.id)
        .maybeSingle();
      if (p) {
        setProfile(p);
        setDraft(p);
      }

      const { data: f } = await supabase
        .from("farms")
        .select("id, name, area_acres, soil_type, water_source")
        .eq("user_id", u.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (f) setFarm(f);

      const { data: np } = await supabase
        .from("notification_preferences")
        .select("weather_alerts, harvest_reminders, task_reminders")
        .eq("user_id", u.id)
        .maybeSingle();
      if (np) setPrefs(np);
    } finally {
      setLoading(false);
    }
  }, [router, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveProfile() {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: draft.full_name,
          phone: draft.phone,
          district: draft.district,
          state: draft.state,
        })
        .eq("id", user.id);
      if (error) throw error;
      setProfile(draft);
      setEditing(false);
      toast.success("Profile updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function togglePref(key: keyof Preferences) {
    if (!user) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    try {
      await supabase
        .from("notification_preferences")
        .upsert({ user_id: user.id, ...next }, { onConflict: "user_id" });
    } catch {
      setPrefs(prefs); // revert
      toast.error("Couldn't save preference");
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/");
  }

  return (
    <div className="min-h-screen bg-stone-50 pb-24">
      <header className="border-b border-stone-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-xl items-center gap-2">
          <button onClick={() => router.back()} aria-label="Back">
            <ArrowLeft size={18} className="text-stone-500" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-stone-900">Profile</h1>
            <p className="text-[11px] leading-none text-stone-500">
              Your details and notifications
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-4 p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-emerald-600" />
          </div>
        ) : (
          <>
            {/* Identity */}
            <section className="rounded-xl border border-stone-200 bg-white p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-lg font-semibold text-emerald-700">
                  {initials(profile?.full_name ?? null)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold text-stone-900">
                    {profile?.full_name || "Set your name"}
                  </p>
                  <p className="truncate text-xs text-stone-500">
                    {user?.email}
                  </p>
                </div>
                {!editing && (
                  <button
                    onClick={() => setEditing(true)}
                    className="rounded-lg p-2 hover:bg-stone-100"
                    aria-label="Edit"
                  >
                    <Pencil size={14} className="text-stone-500" />
                  </button>
                )}
              </div>

              {!editing ? (
                <div className="mt-4 grid grid-cols-1 gap-2 text-sm">
                  <Row icon={<Mail size={14} className="text-stone-500" />} label={user?.email ?? ""} />
                  <Row
                    icon={<Phone size={14} className="text-stone-500" />}
                    label={profile?.phone || "No phone"}
                  />
                  <Row
                    icon={<MapPin size={14} className="text-stone-500" />}
                    label={
                      [profile?.district, profile?.state].filter(Boolean).join(", ") ||
                      "No location set"
                    }
                  />
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  <Field
                    label="Full name"
                    value={draft.full_name ?? ""}
                    onChange={(v) => setDraft((d) => ({ ...d, full_name: v }))}
                  />
                  <Field
                    label="Phone"
                    value={draft.phone ?? ""}
                    onChange={(v) => setDraft((d) => ({ ...d, phone: v }))}
                  />
                  <Field
                    label="District"
                    value={draft.district ?? ""}
                    onChange={(v) => setDraft((d) => ({ ...d, district: v }))}
                  />
                  <Field
                    label="State"
                    value={draft.state ?? ""}
                    onChange={(v) => setDraft((d) => ({ ...d, state: v }))}
                  />
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => {
                        setEditing(false);
                        setDraft(profile ?? draft);
                      }}
                      className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-stone-300 bg-white py-2 text-sm text-stone-700"
                    >
                      <X size={14} /> Cancel
                    </button>
                    <button
                      onClick={saveProfile}
                      disabled={saving}
                      className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      {saving ? "Saving" : "Save"}
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* Farm summary */}
            {farm && (
              <section className="overflow-hidden rounded-xl border border-stone-200 bg-white">
                <div className="border-b border-stone-100 px-4 py-3">
                  <h2 className="text-sm font-semibold text-stone-800">
                    {farm.name ?? "Your farm"}
                  </h2>
                </div>
                <ul className="divide-y divide-stone-100">
                  <FarmRow
                    icon={<Ruler size={14} className="text-stone-500" />}
                    label="Area"
                    value={`${farm.area_acres.toFixed(1)} acres`}
                  />
                  <FarmRow
                    icon={<Sprout size={14} className="text-emerald-600" />}
                    label="Soil"
                    value={farm.soil_type ?? "—"}
                  />
                  <FarmRow
                    icon={<Droplets size={14} className="text-blue-500" />}
                    label="Water source"
                    value={farm.water_source ?? "—"}
                  />
                </ul>
              </section>
            )}

            {/* Notification preferences */}
            <section className="overflow-hidden rounded-xl border border-stone-200 bg-white">
              <div className="border-b border-stone-100 px-4 py-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-stone-800">
                  <Bell size={14} className="text-stone-500" />
                  Notifications
                </h2>
              </div>
              <ul className="divide-y divide-stone-100">
                <Toggle
                  label="Weather alerts"
                  desc="Heads-up before rain, drought, or temperature swings"
                  on={prefs.weather_alerts}
                  onToggle={() => togglePref("weather_alerts")}
                />
                <Toggle
                  label="Harvest reminders"
                  desc="Time to harvest based on planting date"
                  on={prefs.harvest_reminders}
                  onToggle={() => togglePref("harvest_reminders")}
                />
                <Toggle
                  label="Task reminders"
                  desc="Daily morning push of today's tasks"
                  on={prefs.task_reminders}
                  onToggle={() => togglePref("task_reminders")}
                />
              </ul>
            </section>

            {/* Sign out */}
            <button
              onClick={handleLogout}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-3 text-sm font-medium text-red-600 transition hover:bg-red-50"
            >
              <LogOut size={14} />
              Sign out
            </button>
          </>
        )}
      </main>
    </div>
  );
}

// ── Subcomponents ──

function Row({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 text-stone-700">
      {icon}
      <span className="truncate">{label}</span>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-xs">
      <span className="block text-stone-500 mb-1">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
      />
    </label>
  );
}

function FarmRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <li className="flex items-center justify-between px-4 py-3 text-sm">
      <span className="flex items-center gap-2 text-stone-600">
        {icon}
        {label}
      </span>
      <span className="text-stone-800">{value}</span>
    </li>
  );
}

function Toggle({
  label,
  desc,
  on,
  onToggle,
}: {
  label: string;
  desc: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-stone-800">{label}</p>
        <p className="text-[11px] text-stone-500">{desc}</p>
      </div>
      <button
        onClick={onToggle}
        aria-label={`Toggle ${label}`}
        className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${
          on ? "bg-emerald-500" : "bg-stone-300"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            on ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </li>
  );
}
