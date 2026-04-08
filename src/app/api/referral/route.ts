import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { plot_id, case_package_json } = await request.json();

    if (!plot_id || !case_package_json) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Verify the plot belongs to this user's farm
    const { data: plot } = await supabase
      .from("plots")
      .select("id, farm_id, farms!inner(user_id)")
      .eq("id", plot_id)
      .single();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!plot || (plot as any).farms?.[0]?.user_id !== user.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    // Check for an existing pending referral for this plot (created by diagnose route)
    const { data: existing } = await supabase
      .from("expert_referrals")
      .select("*")
      .eq("plot_id", plot_id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (existing) {
      // Update existing referral with enriched case package
      const { data: updated, error } = await supabase
        .from("expert_referrals")
        .update({ case_package_json })
        .eq("id", existing.id)
        .select()
        .single();

      if (error) {
        console.error("Referral update error:", error);
        return NextResponse.json(
          { error: "Failed to update referral" },
          { status: 500 }
        );
      }

      return NextResponse.json({ referral: updated });
    }

    // Create new referral
    const { data: referral, error } = await supabase
      .from("expert_referrals")
      .insert({
        plot_id,
        case_package_json,
        status: "pending",
      })
      .select()
      .single();

    if (error) {
      console.error("Referral insert error:", error);
      return NextResponse.json(
        { error: "Failed to create referral" },
        { status: 500 }
      );
    }

    // Update plot warning level to orange
    await supabase
      .from("plots")
      .update({
        warning_level: "orange",
        warning_reason: "Referred to expert — awaiting response",
        days_since_checked: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", plot_id);

    return NextResponse.json({ referral });
  } catch (err) {
    console.error("Referral POST error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's farm
    const { data: farm } = await supabase
      .from("farms")
      .select("id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!farm) {
      return NextResponse.json({ referrals: [] });
    }

    // Fetch referrals for plots belonging to this farm
    const { data: referrals, error } = await supabase
      .from("expert_referrals")
      .select(
        "id, plot_id, case_package_json, status, expert_response, created_at, resolved_at, plots(label, crop_name)"
      )
      .eq("plots.farm_id", farm.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Referral fetch error:", error);
      return NextResponse.json(
        { error: "Failed to fetch referrals" },
        { status: 500 }
      );
    }

    // Filter out referrals where the join didn't match (plots from other farms)
    const filtered = (referrals || []).filter(
      (r: Record<string, unknown>) => r.plots !== null
    );

    return NextResponse.json({ referrals: filtered });
  } catch (err) {
    console.error("Referral GET error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { referral_id, status, expert_response } = await request.json();

    if (!referral_id || !status) {
      return NextResponse.json(
        { error: "Missing referral_id or status" },
        { status: 400 }
      );
    }

    if (!["pending", "responded", "resolved"].includes(status)) {
      return NextResponse.json(
        { error: "Invalid status" },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = { status };
    if (expert_response) updates.expert_response = expert_response;
    if (status === "resolved") updates.resolved_at = new Date().toISOString();

    const { data: referral, error } = await supabase
      .from("expert_referrals")
      .update(updates)
      .eq("id", referral_id)
      .select("*, plots(label, farm_id)")
      .single();

    if (error) {
      console.error("Referral PATCH error:", error);
      return NextResponse.json(
        { error: "Failed to update referral" },
        { status: 500 }
      );
    }

    // If resolved, clear the plot's orange warning
    if (status === "resolved" && referral) {
      const plotData = referral as Record<string, unknown> & {
        plot_id: string;
      };
      await supabase
        .from("plots")
        .update({
          warning_level: "none",
          warning_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", plotData.plot_id);
    }

    return NextResponse.json({ referral });
  } catch (err) {
    console.error("Referral PATCH error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
