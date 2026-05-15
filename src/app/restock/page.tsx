import { redirect } from "next/navigation";

/**
 * AgroSim 2.1 — legacy /restock URL.
 *
 * The chat list moved to /chats so it can sit beside the Chats entry in
 * the bottom nav. Anyone hitting /restock (old bookmarks, the demo
 * seed's older docs, etc.) gets bounced.
 */
export default function RestockListRedirect() {
  redirect("/chats");
}
