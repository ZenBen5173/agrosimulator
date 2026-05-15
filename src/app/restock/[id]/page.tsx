import { redirect } from "next/navigation";

/**
 * AgroSim 2.1 — legacy /restock/[id] URL.
 *
 * The chat thread moved to /chats/[id]. This shim preserves direct
 * links from older code paths (group buy detail page, books docs tab,
 * older notification deep links).
 */
export default async function RestockChatRedirect(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  redirect(`/chats/${id}`);
}
