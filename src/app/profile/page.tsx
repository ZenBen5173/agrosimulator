"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  User,
  MapPin,
  Phone,
  Mail,
  Download,
  LogOut,
  Bell,
  Pencil,
  X,
  Check,
  Sprout,
  Droplets,
  Layers,
  Ruler,
  FileText,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import Card from "@/components/ui/Card";
import { SkeletonCard, SkeletonLine, SkeletonCircle } from "@/components/ui/Skeleton";
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
  grid_size: number;
}

interface Preferences {
  weather_alerts: boolean;
  harvest_reminders: boolean;
  task_reminders: boolean;
}

interface ReferralItem {
  id: string;
  plot_id: string;
  status: "pending" | "responded" | "resolved";
  case_package_json: {
    crop_name?: string;
    plot_label?: string;
    confidence?: number;
    photo_count?: number;
    referred_date?: string;
  };
  expert_response: string | null;
  created_at: string;
  resolved_at: string | null;
  plots: { label: string; crop_name: string } | null;
}

function getInitials(name: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatLabel(str: string): string {
  return str
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ProfilePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [farm, setFarm] = useState<FarmData | null>(null);
  const [preferences, setPreferences] = useState<Preferences>({
    weather_alerts: true,
    harvest_reminders: true,
    task_reminders: true,
  });
  const [email, setEmail] = useState<string | null>(null);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [saving, setSaving] = useState(false);

  // Export state
  const [exporting, setExporting] = useState(false);

  // Referrals
  const [referrals, setReferrals] = useState<ReferralItem[]>([]);
  const [referralsLoading, setReferralsLoading] = useState(true);
  const [expandedReferral, setExpandedReferral] = useState<string | null>(null);

  // Push notifications
  const { isSupported: pushSupported, permission: pushPermission, subscription: pushSub, subscribe: pushSubscribe, unsubscribe: pushUnsubscribe } = usePushNotifications();
  const [pushLoading, setPushLoading] = useState(false);

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/profile");
      if (!res.ok) {
        if (res.status === 401) {
          router.push("/auth");
          return;
        }
        throw new Error("Failed to fetch profile");
      }
      const data = await res.json();
      setProfile(data.profile);
      setFarm(data.farm);
      setPreferences(
        data.preferences || {
          weather_alerts: true,
          harvest_reminders: true,
          task_reminders: true,
        }
      );
      setEmail(data.email);
    } catch (err) {
      console.error("Failed to load profile:", err);
      toast.error("Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, [router]);

  const fetchReferrals = useCallback(async () => {
    try {
      const res = await fetch("/api/referral");
      if (res.ok) {
        const data = await res.json();
        setReferrals(data.referrals || []);
      }
    } catch (err) {
      console.error("Failed to load referrals:", err);
    } finally {
      setReferralsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
    fetchReferrals();
  }, [fetchProfile, fetchReferrals]);

  const startEditing = () => {
    setEditName(profile?.full_name || "");
    setEditPhone(profile?.phone || "");
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: editName.trim(),
          phone: editPhone.trim(),
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      const data = await res.json();
      setProfile(data.profile);
      setEditing(false);
      toast.success("Profile updated");
    } catch (err) {
      console.error("Save error:", err);
      toast.error("Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  const togglePreference = async (
    key: keyof Preferences,
    value: boolean
  ) => {
    const newPrefs = { ...preferences, [key]: value };
    setPreferences(newPrefs);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from("notification_preferences").upsert(
        {
          user_id: user.id,
          ...newPrefs,
        },
        { onConflict: "user_id" }
      );
    } catch (err) {
      console.error("Failed to save preference:", err);
      // Revert on error
      setPreferences((prev) => ({ ...prev, [key]: !value }));
      toast.error("Failed to save setting");
    }
  };

  const exportReport = async () => {
    if (!farm) {
      toast.error("No farm data to export");
      return;
    }
    setExporting(true);
    try {
      const res = await fetch(`/api/export/report?farm_id=${farm.id}`);
      if (!res.ok) throw new Error("Failed to generate report");
      const data = await res.json();

      // Open report in new window for printing
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(data.html);
        printWindow.document.close();
        // Delay print to allow styles to load
        setTimeout(() => {
          printWindow.print();
        }, 500);
      } else {
        toast.error("Please allow pop-ups to export the report");
      }
    } catch (err) {
      console.error("Export error:", err);
      toast.error("Failed to export report");
    } finally {
      setExporting(false);
    }
  };

  const handleSignOut = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/");
    } catch (err) {
      console.error("Sign out error:", err);
      toast.error("Failed to sign out");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="mx-auto max-w-md space-y-4">
          {/* Header skeleton */}
          <div className="flex flex-col items-center gap-3 py-6">
            <SkeletonCircle className="h-20 w-20" />
            <SkeletonLine className="h-5 w-40" />
            <SkeletonLine className="h-4 w-32" />
          </div>
          <SkeletonCard className="h-40" />
          <SkeletonCard className="h-32" />
          <SkeletonCard className="h-28" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      <div className="mx-auto max-w-md space-y-4 p-4">
        {/* ───── Profile Header ───── */}
        <Card variant="elevated" className="relative overflow-hidden p-6">
          {/* Green accent bar */}
          <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-br from-green-500 to-green-600" />

          <div className="relative flex flex-col items-center pt-6">
            {/* Avatar */}
            <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-green-100 text-2xl font-bold text-green-700 shadow-md">
              {getInitials(profile?.full_name ?? null)}
            </div>

            {editing ? (
              /* ── Edit mode ── */
              <div className="mt-4 w-full space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-100"
                    placeholder="Your full name"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-100"
                    placeholder="+60 12-345 6789"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={cancelEditing}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
                  >
                    <X size={16} />
                    Cancel
                  </button>
                  <button
                    onClick={saveProfile}
                    disabled={saving}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-green-700 disabled:opacity-50"
                  >
                    <Check size={16} />
                    {saving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            ) : (
              /* ── Display mode ── */
              <>
                <h2 className="mt-4 text-lg font-semibold text-gray-900">
                  {profile?.full_name || "Set Your Name"}
                </h2>

                <div className="mt-2 space-y-1.5">
                  {email && (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Mail size={14} className="text-gray-400" />
                      {email}
                    </div>
                  )}
                  {profile?.phone && (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Phone size={14} className="text-gray-400" />
                      {profile.phone}
                    </div>
                  )}
                  {(profile?.district || profile?.state) && (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <MapPin size={14} className="text-gray-400" />
                      {[profile.district, profile.state]
                        .filter(Boolean)
                        .join(", ")}
                    </div>
                  )}
                </div>

                <button
                  onClick={startEditing}
                  className="mt-4 flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
                >
                  <Pencil size={14} />
                  Edit Profile
                </button>
              </>
            )}
          </div>
        </Card>

        {/* ───── Farm Info Card ───── */}
        {farm && (
          <Card variant="elevated" className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-50">
                <Sprout size={16} className="text-green-600" />
              </div>
              <h3 className="font-semibold text-gray-900">Farm Info</h3>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <InfoRow
                icon={<Sprout size={14} className="text-gray-400" />}
                label="Farm Name"
                value={farm.name || "—"}
              />
              <InfoRow
                icon={<Ruler size={14} className="text-gray-400" />}
                label="Area"
                value={farm.area_acres ? `${farm.area_acres.toFixed(1)} acres` : "—"}
              />
              <InfoRow
                icon={<Layers size={14} className="text-gray-400" />}
                label="Soil Type"
                value={farm.soil_type ? formatLabel(farm.soil_type) : "—"}
              />
              <InfoRow
                icon={<Droplets size={14} className="text-gray-400" />}
                label="Water Source"
                value={farm.water_source ? formatLabel(farm.water_source) : "—"}
              />
            </div>
          </Card>
        )}

        {/* ───── Notification Settings ───── */}
        <Card variant="elevated" className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50">
              <Bell size={16} className="text-amber-600" />
            </div>
            <h3 className="font-semibold text-gray-900">Notifications</h3>
          </div>

          <div className="space-y-1">
            <ToggleRow
              label="Weather Alerts"
              description="Severe weather and flood risk warnings"
              checked={preferences.weather_alerts}
              onChange={(v) => togglePreference("weather_alerts", v)}
            />
            <ToggleRow
              label="Harvest Reminders"
              description="When crops are ready to harvest"
              checked={preferences.harvest_reminders}
              onChange={(v) => togglePreference("harvest_reminders", v)}
            />
            <ToggleRow
              label="Task Reminders"
              description="Daily task and inspection reminders"
              checked={preferences.task_reminders}
              onChange={(v) => togglePreference("task_reminders", v)}
            />

            {/* Push notifications */}
            {pushSupported && (
              <div className="mt-2 border-t border-gray-100 pt-2">
                {pushPermission === "denied" ? (
                  <div className="rounded-xl bg-red-50 px-3 py-3">
                    <div className="text-sm font-medium text-red-700">
                      Push Notifications Blocked
                    </div>
                    <div className="text-xs text-red-500">
                      Enable in your browser settings to receive alerts
                    </div>
                  </div>
                ) : (
                  <label className="flex cursor-pointer items-center justify-between rounded-xl px-2 py-3 transition hover:bg-gray-50">
                    <div className="pr-4">
                      <div className="text-sm font-medium text-gray-800">
                        Push Notifications
                      </div>
                      <div className="text-xs text-gray-400">
                        Receive alerts even when app is closed
                      </div>
                    </div>
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={!!pushSub}
                        disabled={pushLoading}
                        onChange={async (e) => {
                          setPushLoading(true);
                          try {
                            if (e.target.checked) {
                              await pushSubscribe();
                              toast.success("Push notifications enabled");
                            } else {
                              await pushUnsubscribe();
                              toast.success("Push notifications disabled");
                            }
                          } catch {
                            toast.error("Failed to update push settings");
                          } finally {
                            setPushLoading(false);
                          }
                        }}
                        className="peer sr-only"
                      />
                      <div className="h-6 w-11 rounded-full bg-gray-200 transition peer-checked:bg-green-500" />
                      <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
                    </div>
                  </label>
                )}
              </div>
            )}
          </div>
        </Card>

        {/* ───── My Referrals ───── */}
        <Card variant="elevated" className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50">
              <FileText size={16} className="text-orange-600" />
            </div>
            <h3 className="font-semibold text-gray-900">My Referrals</h3>
          </div>

          {referralsLoading ? (
            <div className="space-y-2">
              <div className="h-16 animate-pulse rounded-xl bg-gray-100" />
              <div className="h-16 animate-pulse rounded-xl bg-gray-100" />
            </div>
          ) : referrals.length === 0 ? (
            <div className="rounded-xl bg-gray-50 px-4 py-6 text-center">
              <p className="text-sm text-gray-400">No expert referrals yet</p>
              <p className="mt-1 text-xs text-gray-300">
                Referrals appear here when AI cannot diagnose a crop issue
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {referrals.map((ref) => {
                const statusStyles = {
                  pending: {
                    badge: "bg-amber-100 text-amber-700",
                    dot: "bg-amber-400",
                  },
                  responded: {
                    badge: "bg-blue-100 text-blue-700",
                    dot: "bg-blue-400",
                  },
                  resolved: {
                    badge: "bg-green-100 text-green-700",
                    dot: "bg-green-400",
                  },
                };
                const style = statusStyles[ref.status];
                const plotLabel =
                  ref.plots?.label ||
                  ref.case_package_json?.plot_label ||
                  "Unknown";
                const cropName =
                  ref.plots?.crop_name ||
                  ref.case_package_json?.crop_name ||
                  "Unknown";
                const date = new Date(ref.created_at).toLocaleDateString(
                  "en-MY",
                  { day: "numeric", month: "short", year: "numeric" }
                );
                const isExpanded = expandedReferral === ref.id;

                return (
                  <button
                    key={ref.id}
                    onClick={() =>
                      setExpandedReferral(isExpanded ? null : ref.id)
                    }
                    className="w-full rounded-xl border border-gray-100 bg-gray-50 p-3 text-left transition hover:bg-gray-100"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-800">
                            {plotLabel}
                          </span>
                          <span className="text-xs text-gray-400">
                            {cropName}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-gray-400">{date}</p>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${style.badge}`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${style.dot}`}
                        />
                        {ref.status.charAt(0).toUpperCase() +
                          ref.status.slice(1)}
                      </span>
                    </div>

                    {isExpanded && (
                      <div className="mt-3 space-y-2 border-t border-gray-200 pt-3">
                        {ref.case_package_json?.confidence != null && (
                          <div className="text-xs text-gray-500">
                            AI Confidence:{" "}
                            {Math.round(ref.case_package_json.confidence * 100)}
                            %
                          </div>
                        )}
                        {ref.case_package_json?.photo_count != null && (
                          <div className="text-xs text-gray-500">
                            Photos: {ref.case_package_json.photo_count}
                          </div>
                        )}
                        {ref.expert_response && (
                          <div className="rounded-lg bg-blue-50 p-2">
                            <p className="text-[10px] font-medium text-blue-700">
                              Expert Response:
                            </p>
                            <p className="mt-0.5 text-xs text-blue-600">
                              {ref.expert_response}
                            </p>
                          </div>
                        )}
                        {ref.resolved_at && (
                          <div className="text-xs text-green-600">
                            Resolved:{" "}
                            {new Date(ref.resolved_at).toLocaleDateString(
                              "en-MY",
                              {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              }
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        {/* ───── Actions ───── */}
        <Card variant="elevated" className="p-5">
          <div className="space-y-3">
            <button
              onClick={exportReport}
              disabled={exporting || !farm}
              className="flex w-full items-center gap-3 rounded-xl border border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50">
                <Download size={16} className="text-blue-600" />
              </div>
              <div className="flex-1">
                <div>{exporting ? "Generating Report..." : "Export Farm Report"}</div>
                <div className="text-xs font-normal text-gray-400">
                  Generate printable PDF report
                </div>
              </div>
            </button>

            <button
              onClick={handleSignOut}
              className="flex w-full items-center gap-3 rounded-xl border border-red-100 px-4 py-3 text-left text-sm font-medium text-red-600 transition hover:bg-red-50"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50">
                <LogOut size={16} className="text-red-500" />
              </div>
              <div className="flex-1">
                <div>Sign Out</div>
                <div className="text-xs font-normal text-gray-400">
                  Log out of your account
                </div>
              </div>
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ───── Sub-components ───── */

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2.5">
      <div className="mt-0.5">{icon}</div>
      <div>
        <div className="text-[11px] font-medium text-gray-400">{label}</div>
        <div className="text-sm font-medium text-gray-800">{value}</div>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between rounded-xl px-2 py-3 transition hover:bg-gray-50">
      <div className="pr-4">
        <div className="text-sm font-medium text-gray-800">{label}</div>
        <div className="text-xs text-gray-400">{description}</div>
      </div>
      <div className="relative">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <div className="h-6 w-11 rounded-full bg-gray-200 transition peer-checked:bg-green-500" />
        <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
      </div>
    </label>
  );
}
