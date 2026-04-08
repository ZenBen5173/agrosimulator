"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";

const FarmSetup = dynamic(() => import("@/components/FarmSetup"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-screen items-center justify-center bg-green-50">
      <p className="text-lg text-green-700">Loading map...</p>
    </div>
  ),
});

export default function RedrawPage() {
  const [farmId, setFarmId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadFarmId() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const { data: farm } = await supabase
        .from("farms")
        .select("id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (farm) setFarmId(farm.id);
      setLoading(false);
    }

    loadFarmId();
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-green-50">
        <p className="text-lg text-green-700">Loading...</p>
      </div>
    );
  }

  if (!farmId) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-green-50">
        <p className="text-lg text-red-600">No farm found.</p>
      </div>
    );
  }

  return <FarmSetup editFarmId={farmId} />;
}
