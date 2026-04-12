import { rateLimit } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { chatActionFlow } from "@/flows/chatAction";
import { sendPushToUser } from "@/lib/pushNotify";
import { getOrigin } from "@/lib/origin";
import { getNextDocNumber, insertDocumentItems, updateInventoryStock } from "@/lib/business";

export async function POST(request: Request) {
    const limited = rateLimit(request, "chat"); if (limited) return limited;

  try {
    const { farm_id, message, thread_id } = await request.json();

    if (!farm_id || !message) {
      return NextResponse.json(
        { error: "farm_id and message are required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch farm details for context
    const { data: farm } = await supabase
      .from("farms")
      .select("id, name, soil_type, water_source, district, state, area_acres")
      .eq("id", farm_id)
      .single();

    if (!farm) {
      return NextResponse.json({ error: "Farm not found" }, { status: 404 });
    }

    // Fetch plots
    const { data: plots } = await supabase
      .from("plots")
      .select(
        "id, label, crop_name, growth_stage, planted_date, expected_harvest, warning_level, warning_reason, days_since_checked"
      )
      .eq("farm_id", farm_id);

    // Fetch weather
    const { data: weatherSnap } = await supabase
      .from("weather_snapshots")
      .select("condition, temp_celsius, humidity_pct, rainfall_mm, wind_kmh")
      .eq("farm_id", farm_id)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .single();

    // Fetch pending tasks
    const { data: recentTasks } = await supabase
      .from("tasks")
      .select("title, task_type, priority, due_date")
      .eq("farm_id", farm_id)
      .eq("completed", false)
      .order("priority")
      .limit(10);

    // Fetch chat history (filtered by thread if provided)
    let historyQuery = supabase
      .from("chat_messages")
      .select("role, content")
      .eq("farm_id", farm_id)
      .order("created_at", { ascending: true })
      .limit(10);
    if (thread_id) historyQuery = historyQuery.eq("thread_id", thread_id);
    const { data: chatHistory } = await historyQuery;

    // Build context
    const contextParts: string[] = [];
    contextParts.push(`Farm: ${farm.name || "Unnamed"}, ${farm.area_acres} acres, ${farm.district || "?"}, ${farm.state || "?"}`);
    contextParts.push(`Soil: ${farm.soil_type || "?"}, Water: ${farm.water_source || "?"}`);
    if (weatherSnap) {
      contextParts.push(`Weather: ${weatherSnap.condition}, ${weatherSnap.temp_celsius}°C, humidity ${weatherSnap.humidity_pct}%`);
    }
    if (plots && plots.length > 0) {
      contextParts.push(`Plots: ${plots.map((p) => `${p.label}: ${p.crop_name} (${p.growth_stage})${p.warning_level !== "none" ? ` [${p.warning_level}]` : ""}`).join(", ")}`);
    }
    if (recentTasks && recentTasks.length > 0) {
      contextParts.push(`Pending tasks: ${recentTasks.map((t) => `[${t.priority}] ${t.title}`).join(", ")}`);
    }

    const history = (chatHistory || []).map((msg) => ({
      role: msg.role as string,
      content: msg.content as string,
    }));

    // Call Genkit chat-action flow
    const result = await chatActionFlow({
      farmId: farm_id,
      message,
      systemContext: contextParts.join("\n"),
      history,
    });

    // Execute action if present
    let actionResult: { type: string; details: string } | null = null;

    if (result.action && result.action.action_type !== "none") {
      const action = result.action;
      const today = new Date().toISOString().split("T")[0];

      // Map plot label to ID
      const labelToId: Record<string, string> = {};
      for (const p of plots || []) {
        labelToId[p.label] = p.id;
      }
      const plotId = action.plot_label ? labelToId[action.plot_label] || null : null;

      switch (action.action_type) {
        case "create_task":
        case "create_inspection":
        case "schedule_watering": {
          const taskType =
            action.action_type === "create_inspection"
              ? "inspection"
              : action.action_type === "schedule_watering"
                ? "watering"
                : action.task_type || "farm_wide";

          const { data: task } = await supabase.from("tasks").insert({
            farm_id,
            plot_id: plotId,
            title: action.task_title || `${taskType} task`,
            description: action.task_description || "",
            task_type: taskType,
            priority: action.priority || "normal",
            due_date: today,
            completed: false,
            auto_generated: true,
            triggered_by: "chat",
            resource_item: action.item_name || null,
            resource_quantity: action.quantity || null,
            resource_unit: action.unit || null,
          }).select().single();

          actionResult = {
            type: action.action_type,
            details: `Created task: "${action.task_title}"${plotId ? ` for plot ${action.plot_label}` : ""}`,
          };

          // Send push notification
          sendPushToUser(user.id, {
            title: "AgroBot Action",
            body: `Task created: ${action.task_title}`,
            url: "/home",
            tag: "chat-action",
          }).catch(() => {});
          break;
        }

        case "reorder_item": {
          if (action.item_name) {
            await supabase.from("purchase_requests").insert({
              farm_id,
              item_name: action.item_name,
              quantity: action.quantity || 1,
              unit: action.unit || "kg",
              status: "pending",
            });
            actionResult = {
              type: "reorder_item",
              details: `Reorder request created: ${action.item_name} (${action.quantity || 1} ${action.unit || "kg"})`,
            };
          }
          break;
        }

        case "create_alert": {
          await supabase.from("farm_alerts").insert({
            farm_id,
            alert_type: "general",
            title: action.task_title || "Chat-generated alert",
            summary: action.task_description || message,
            severity: action.priority === "urgent" ? "high" : "medium",
            recommended_action: action.task_description || null,
            source_type: "news",
          });
          actionResult = {
            type: "create_alert",
            details: `Alert created: "${action.task_title}"`,
          };
          break;
        }

        case "create_rq": {
          if (action.items && action.items.length > 0) {
            // Find or create supplier
            let supplierId: string | null = null;
            if (action.supplier_name) {
              const { data: existing } = await supabase.from("suppliers").select("id").eq("farm_id", farm_id).ilike("name", `%${action.supplier_name}%`).limit(1).single();
              supplierId = existing?.id || null;
            }

            const rfqNumber = await getNextDocNumber(farm_id, "RQ", "purchase_rfqs");
            const totalRm = action.items.reduce((s, i) => s + i.quantity * i.unit_price_rm, 0);

            const { data: rfq } = await supabase.from("purchase_rfqs").insert({
              farm_id,
              supplier_id: supplierId,
              rfq_number: rfqNumber,
              rfq_date: today,
              status: "draft",
              notes: `Created via AgroBot chat`,
              total_rm: totalRm,
            }).select().single();

            if (rfq) {
              await insertDocumentItems(rfq.id, "rfq", action.items.map((i) => ({
                item_name: i.item_name,
                quantity: i.quantity,
                unit: i.unit,
                unit_price_rm: i.unit_price_rm,
              })));

              actionResult = {
                type: "create_rq",
                details: `RQ drafted: ${rfqNumber} (RM${totalRm.toFixed(2)}) — [View RQ](/business/rfq/${rfq.id})`,
              };

              // Store rq_id in metadata so next "ok" can reference it
              result.action!.rq_id = rfq.id;
            }
          }
          break;
        }

        case "confirm_purchase": {
          const rfqId = action.rq_id;
          if (!rfqId) {
            // Try to find the last RQ from chat metadata
            const { data: lastMsg } = await supabase.from("chat_messages")
              .select("metadata")
              .eq("farm_id", farm_id)
              .eq("role", "assistant")
              .order("created_at", { ascending: false })
              .limit(5);

            const foundRfqId = lastMsg?.find((m) => {
              const meta = m.metadata as Record<string, unknown> | null;
              return meta?.action && (meta.action as Record<string, unknown>).rq_id;
            });
            const resolvedRfqId = foundRfqId ? ((foundRfqId.metadata as Record<string, unknown>).action as Record<string, unknown>).rq_id as string : null;

            if (resolvedRfqId) {
              action.rq_id = resolvedRfqId;
            }
          }

          if (action.rq_id) {
            // Get RQ details
            const { data: rfq } = await supabase.from("purchase_rfqs").select("*, suppliers(name)").eq("id", action.rq_id).single();
            if (rfq) {
              // Create PO from RQ
              const origin = getOrigin(request);
              const poRes = await fetch(`${origin}/api/purchase/orders`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Cookie: request.headers.get("cookie") || "" },
                body: JSON.stringify({ farm_id, supplier_id: rfq.supplier_id, rq_id: rfq.id }),
              });

              if (poRes.ok) {
                const poData = await poRes.json();

                // Create GRN from PO
                const grnRes = await fetch(`${origin}/api/purchase/grn`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", Cookie: request.headers.get("cookie") || "" },
                  body: JSON.stringify({ farm_id, po_id: poData.id, supplier_id: rfq.supplier_id }),
                });

                let billNumber = "";
                if (grnRes.ok) {
                  const grnData = await grnRes.json();

                  // Create Bill from GRN
                  const billRes = await fetch(`${origin}/api/purchase/invoices`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Cookie: request.headers.get("cookie") || "" },
                    body: JSON.stringify({ farm_id, supplier_id: rfq.supplier_id, po_id: poData.id, grn_id: grnData.id }),
                  });

                  if (billRes.ok) {
                    const billData = await billRes.json();
                    billNumber = billData.bill_number;
                  }
                }

                const supplierName = (rfq.suppliers as { name: string } | null)?.name || "supplier";
                actionResult = {
                  type: "confirm_purchase",
                  details: `Purchase confirmed! Created ${poData.po_number} → GRN → ${billNumber || "Bill"}. Inventory updated, expense recorded. [View PO](/business/purchase_order/${poData.id})`,
                };
              }
            }
          } else {
            actionResult = {
              type: "confirm_purchase",
              details: "No pending RQ found. Please request a restock first.",
            };
          }
          break;
        }
      }
    }

    // Save messages to chat_messages
    await supabase.from("chat_messages").insert({
      farm_id,
      thread_id: thread_id || null,
      role: "user",
      content: message,
    });

    const replyWithAction = actionResult
      ? `${result.reply}\n\n✅ **Action taken:** ${actionResult.details}`
      : result.reply;

    await supabase.from("chat_messages").insert({
      farm_id,
      thread_id: thread_id || null,
      role: "assistant",
      content: replyWithAction,
      metadata: {
        action: result.action,
        used_tools: result.used_tools,
        action_result: actionResult,
      },
    });

    // Update thread last_message + auto-title on first message
    if (thread_id) {
      const preview = replyWithAction.split("\n")[0].slice(0, 100);
      await supabase.from("chat_threads").update({
        last_message: preview,
        last_message_at: new Date().toISOString(),
      }).eq("id", thread_id);

      // Auto-title: if thread title is still "New Chat", generate one from the message
      const { data: thread } = await supabase.from("chat_threads").select("title").eq("id", thread_id).single();
      if (thread && thread.title === "New Chat") {
        // Simple title: first 5 words of user message
        const words = message.split(/\s+/).slice(0, 5).join(" ");
        const title = words.length > 30 ? words.slice(0, 30) + "..." : words;
        await supabase.from("chat_threads").update({ title }).eq("id", thread_id);
      }
    }

    return NextResponse.json({
      reply: replyWithAction,
      action: actionResult,
      used_tools: result.used_tools,
      source: "vertex_ai",
      model: "gemini-2.5-flash",
    });
  } catch (err) {
    console.error("Chat API error:", err);

    // Return mock fallback response so chat doesn't break
    const mockReply = "I'm having trouble connecting to AI right now. Please try again in a moment.";
    return NextResponse.json({
      reply: mockReply,
      action: null,
      used_tools: [],
      source: "mock",
      model: null,
      error: "ai_unavailable",
    });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const farm_id = searchParams.get("farm_id");

    if (!farm_id) {
      return NextResponse.json(
        { error: "farm_id is required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const thread_id = searchParams.get("thread_id");

    let query = supabase
      .from("chat_messages")
      .select("id, farm_id, thread_id, role, content, metadata, created_at")
      .eq("farm_id", farm_id)
      .order("created_at", { ascending: true })
      .limit(50);
    if (thread_id) query = query.eq("thread_id", thread_id);

    const { data: messages, error } = await query;

    if (error) {
      return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
    }

    return NextResponse.json({ messages: messages || [] });
  } catch (err) {
    console.error("Chat GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
