/**
 * ─────────────────────────────────────────────────────────────────────────────
 * DEMO MODE SUPABASE MOCK CLIENT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * WHY THIS EXISTS:
 *
 * AgroSim's Supabase project is paused outside active development to comply
 * with the free tier limit of 2 active projects per organization. To keep
 * the live Cloud Run deployment functional for hackathon judges even when
 * the database is offline, this file implements a minimal in-memory mock
 * that mimics the @supabase/supabase-js client interface.
 *
 * HOW IT WORKS:
 *
 *   • Reads — return seed data from `src/data/seed-data.ts`
 *   • Writes — persist in browser sessionStorage (or in-memory on server)
 *   • Auth — always returns the demo user (no real authentication)
 *   • Storage — no-op (returns mock URLs)
 *
 * CONTROLLED BY:
 *
 *   process.env.DEMO_MODE === "true"  (or NEXT_PUBLIC_DEMO_MODE)
 *
 * LIMITATIONS:
 *
 *   • Writes don't sync between tabs / users (each session is isolated)
 *   • Some advanced query patterns (joins, RPC, subqueries) are not supported
 *   • The server-side write store is per-instance and won't persist between
 *     requests on Cloud Run cold starts. This is acceptable because the
 *     demo flow is read-mostly and the wow-moment writes are echoed back
 *     to the client which stores them in sessionStorage.
 *
 * SAFETY:
 *
 *   This mock is ONLY active when DEMO_MODE=true. All production paths
 *   continue to use the real Supabase client unchanged.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { SEED, DEMO_USER, type SeedTable } from "@/data/seed-data";

// In-memory write store for server-side writes (per Cloud Run instance)
const SERVER_WRITES: Record<string, Record<string, unknown>[]> = {};

function getSessionWrites(table: string): Record<string, unknown>[] {
  if (typeof window === "undefined") {
    return SERVER_WRITES[table] || [];
  }
  try {
    const raw = sessionStorage.getItem(`agrosim_demo_${table}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function appendSessionWrite(table: string, row: Record<string, unknown>) {
  if (typeof window === "undefined") {
    SERVER_WRITES[table] = SERVER_WRITES[table] || [];
    SERVER_WRITES[table].push(row);
    return;
  }
  try {
    const writes = getSessionWrites(table);
    writes.push(row);
    sessionStorage.setItem(`agrosim_demo_${table}`, JSON.stringify(writes));
  } catch {
    // sessionStorage full or unavailable — no-op
  }
}

function getTableData(table: string): Record<string, unknown>[] {
  const seed = (SEED as Record<string, unknown>)[table];
  const seedRows = Array.isArray(seed) ? (seed as Record<string, unknown>[]) : [];
  return [...seedRows, ...getSessionWrites(table)];
}

// Generate a UUID for new inserts
function genId(): string {
  // Simple v4-ish UUID
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ── Query Builder ──
type Filter = { type: string; col: string; val: unknown; vals?: unknown[] };

class DemoQueryBuilder {
  private table: string;
  private filters: Filter[] = [];
  private orderBy: { col: string; ascending: boolean } | null = null;
  private limitN: number | null = null;
  private singleRow = false;
  private mode: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private payload: unknown = null;

  constructor(table: string) {
    this.table = table;
  }

  select(_cols?: string) {
    this.mode = "select";
    return this;
  }

  insert(payload: unknown) {
    this.mode = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: unknown) {
    this.mode = "update";
    this.payload = payload;
    return this;
  }

  upsert(payload: unknown) {
    this.mode = "upsert";
    this.payload = payload;
    return this;
  }

  delete() {
    this.mode = "delete";
    return this;
  }

  eq(col: string, val: unknown) { this.filters.push({ type: "eq", col, val }); return this; }
  neq(col: string, val: unknown) { this.filters.push({ type: "neq", col, val }); return this; }
  in(col: string, vals: unknown[]) { this.filters.push({ type: "in", col, val: null, vals }); return this; }
  is(col: string, val: unknown) { this.filters.push({ type: "is", col, val }); return this; }
  not(col: string, op: string, val: unknown) { this.filters.push({ type: `not_${op}`, col, val }); return this; }
  gte(col: string, val: unknown) { this.filters.push({ type: "gte", col, val }); return this; }
  lte(col: string, val: unknown) { this.filters.push({ type: "lte", col, val }); return this; }
  gt(col: string, val: unknown) { this.filters.push({ type: "gt", col, val }); return this; }
  lt(col: string, val: unknown) { this.filters.push({ type: "lt", col, val }); return this; }
  ilike(col: string, val: string) { this.filters.push({ type: "ilike", col, val }); return this; }
  like(col: string, val: string) { this.filters.push({ type: "like", col, val }); return this; }
  match(obj: Record<string, unknown>) {
    Object.entries(obj).forEach(([col, val]) => this.filters.push({ type: "eq", col, val }));
    return this;
  }
  contains(col: string, val: unknown) { this.filters.push({ type: "contains", col, val }); return this; }
  containedBy(col: string, val: unknown) { this.filters.push({ type: "containedBy", col, val }); return this; }

  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy = { col, ascending: opts?.ascending !== false };
    return this;
  }

  limit(n: number) { this.limitN = n; return this; }

  single() {
    this.singleRow = true;
    return this.execute();
  }

  maybeSingle() {
    this.singleRow = true;
    return this.execute();
  }

  // Allow `await` directly
  then<TResult1 = unknown, TResult2 = never>(
    resolve?: ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
    reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(resolve, reject);
  }

  private applyFilters(rows: Record<string, unknown>[]): Record<string, unknown>[] {
    return rows.filter((row) => {
      for (const f of this.filters) {
        const cell = row[f.col];
        switch (f.type) {
          case "eq": if (cell !== f.val) return false; break;
          case "neq": if (cell === f.val) return false; break;
          case "in": if (!f.vals?.includes(cell)) return false; break;
          case "is": if (f.val === null ? cell != null : cell !== f.val) return false; break;
          case "gte": if ((cell as number) < (f.val as number)) return false; break;
          case "lte": if ((cell as number) > (f.val as number)) return false; break;
          case "gt": if ((cell as number) <= (f.val as number)) return false; break;
          case "lt": if ((cell as number) >= (f.val as number)) return false; break;
          case "ilike": {
            const pat = String(f.val).replace(/%/g, ".*");
            if (!new RegExp(pat, "i").test(String(cell))) return false;
            break;
          }
          case "like": {
            const pat = String(f.val).replace(/%/g, ".*");
            if (!new RegExp(pat).test(String(cell))) return false;
            break;
          }
          case "not_is": if (f.val === null ? cell == null : cell === f.val) return false; break;
        }
      }
      return true;
    });
  }

  private async execute(): Promise<{ data: unknown; error: unknown }> {
    try {
      const rows = getTableData(this.table);

      if (this.mode === "select") {
        let result = this.applyFilters(rows);
        if (this.orderBy) {
          const { col, ascending } = this.orderBy;
          result = [...result].sort((a, b) => {
            const av = a[col] as number | string | null;
            const bv = b[col] as number | string | null;
            if (av == null && bv == null) return 0;
            if (av == null) return ascending ? -1 : 1;
            if (bv == null) return ascending ? 1 : -1;
            if (av < bv) return ascending ? -1 : 1;
            if (av > bv) return ascending ? 1 : -1;
            return 0;
          });
        }
        if (this.limitN != null) result = result.slice(0, this.limitN);
        if (this.singleRow) {
          return { data: result[0] || null, error: result[0] ? null : { code: "PGRST116", message: "No rows" } };
        }
        return { data: result, error: null };
      }

      if (this.mode === "insert" || this.mode === "upsert") {
        const items = Array.isArray(this.payload) ? this.payload : [this.payload];
        const inserted = (items as Record<string, unknown>[]).map((row) => {
          const withId = { ...row, id: row.id || genId(), created_at: row.created_at || new Date().toISOString() };
          appendSessionWrite(this.table, withId);
          return withId;
        });
        if (this.singleRow) return { data: inserted[0] || null, error: null };
        return { data: inserted, error: null };
      }

      if (this.mode === "update") {
        // We can't actually mutate seed; just return the merged row as if it succeeded
        const matches = this.applyFilters(rows);
        const updated = matches.map((r) => ({ ...r, ...(this.payload as Record<string, unknown>) }));
        if (this.singleRow) return { data: updated[0] || null, error: null };
        return { data: updated, error: null };
      }

      if (this.mode === "delete") {
        return { data: null, error: null };
      }

      return { data: null, error: null };
    } catch (e) {
      return { data: null, error: { message: String(e) } };
    }
  }
}

// ── Auth Stub ──
const fakeUser = { id: DEMO_USER.id, email: DEMO_USER.email, app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: new Date().toISOString() };
const fakeSession = { access_token: "demo-mode-token", token_type: "bearer", refresh_token: "demo-refresh", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: fakeUser };

const demoAuth = {
  getUser: async () => ({ data: { user: fakeUser }, error: null }),
  getSession: async () => ({ data: { session: fakeSession }, error: null }),
  signOut: async () => ({ error: null }),
  signInWithOtp: async () => ({ data: { user: fakeUser, session: fakeSession }, error: null }),
  signInWithPassword: async () => ({ data: { user: fakeUser, session: fakeSession }, error: null }),
  exchangeCodeForSession: async () => ({ data: { session: fakeSession, user: fakeUser }, error: null }),
  verifyOtp: async () => ({ data: { user: fakeUser, session: fakeSession }, error: null }),
  refreshSession: async () => ({ data: { user: fakeUser, session: fakeSession }, error: null }),
  setSession: async () => ({ data: { user: fakeUser, session: fakeSession }, error: null }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  admin: {
    generateLink: async () => ({ data: { properties: { action_link: "/auth/callback?code=demo" } }, error: null }),
  },
};

// ── Storage Stub ──
const demoStorage = {
  from: () => ({
    upload: async () => ({ data: { path: "demo/mock-upload" }, error: null }),
    download: async () => ({ data: new Blob(), error: null }),
    getPublicUrl: () => ({ data: { publicUrl: "https://example.com/demo.png" } }),
    list: async () => ({ data: [], error: null }),
    remove: async () => ({ data: [], error: null }),
  }),
};

// ── Public Mock Client ──
export function createDemoClient() {
  return {
    from: (table: string) => new DemoQueryBuilder(table as SeedTable),
    auth: demoAuth,
    storage: demoStorage,
    rpc: async () => ({ data: null, error: null }),
    channel: () => ({
      on: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
      subscribe: () => ({ unsubscribe: () => {} }),
    }),
    removeChannel: () => {},
  };
}
