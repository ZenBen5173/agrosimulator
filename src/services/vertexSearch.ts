/**
 * Agricultural Knowledge Search
 *
 * Uses Vertex AI Search (Discovery Engine) when available,
 * falls back to local JSON file search.
 */

import diseaseData from "../../data/mardi-diseases.json";
import soilData from "../../data/malaysian-soil-profiles.json";
import priceData from "../../data/fama-price-history.json";

interface SearchResult {
  title: string;
  content: string;
  source: string;
  relevance: number;
}

/**
 * Search agricultural knowledge base.
 * Searches diseases, soil profiles, and price data.
 * Falls back to local JSON if Vertex AI Search is unavailable.
 */
export async function searchAgriculturalKnowledge(
  query: string,
  numResults: number = 5
): Promise<SearchResult[]> {
  // Try Vertex AI Search first
  if (process.env.VERTEX_SEARCH_DATASTORE_ID && process.env.GOOGLE_CLOUD_PROJECT_ID) {
    try {
      return await vertexAISearch(query, numResults);
    } catch (err) {
      console.warn("[VertexSearch] API failed, falling back to local:", err);
    }
  }

  // Fallback: local JSON search
  return localSearch(query, numResults);
}

/**
 * Vertex AI Search via Discovery Engine API
 */
async function vertexAISearch(query: string, numResults: number): Promise<SearchResult[]> {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
  const datastoreId = process.env.VERTEX_SEARCH_DATASTORE_ID;
  const location = process.env.VERTEX_SEARCH_LOCATION || "global";

  // Use REST API with Application Default Credentials
  const { GoogleAuth } = await import("google-auth-library");
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const client = await auth.getClient();
  const token = await client.getAccessToken();

  const url = `https://discoveryengine.googleapis.com/v1/projects/${projectId}/locations/${location}/collections/default_collection/dataStores/${datastoreId}/servingConfigs/default_search:search`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token.token}`,
    },
    body: JSON.stringify({
      query,
      pageSize: numResults,
      queryExpansionSpec: { condition: "AUTO" },
      spellCorrectionSpec: { mode: "AUTO" },
    }),
  });

  if (!res.ok) throw new Error(`Vertex Search ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const results: SearchResult[] = [];

  for (const result of data.results || []) {
    const doc = result.document;
    if (!doc) continue;

    const content = doc.derivedStructData?.snippets?.[0]?.snippet ||
                    doc.structData?.content ||
                    JSON.stringify(doc.structData || {}).slice(0, 500);

    results.push({
      title: doc.structData?.disease_name || doc.structData?.crop || doc.structData?.district || "Document",
      content,
      source: "vertex_ai_search",
      relevance: result.relevanceScore || 0.5,
    });
  }

  return results;
}

/**
 * Local JSON search — simple keyword matching across all data files.
 */
function localSearch(query: string, numResults: number): SearchResult[] {
  const queryLower = query.toLowerCase();
  const words = queryLower.split(/\s+/).filter((w) => w.length > 2);
  const results: SearchResult[] = [];

  // Search diseases
  for (const d of diseaseData) {
    const searchText = `${d.crop} ${d.disease_name} ${d.scientific_name} ${d.symptoms} ${d.treatment_steps.join(" ")} ${d.prevention}`.toLowerCase();
    const matchCount = words.filter((w) => searchText.includes(w)).length;
    if (matchCount > 0) {
      results.push({
        title: `${d.crop}: ${d.disease_name}`,
        content: `Symptoms: ${d.symptoms}. Treatment: ${d.treatment_steps.slice(0, 2).join(". ")}. Prevention: ${d.prevention}`,
        source: "mardi_diseases",
        relevance: matchCount / words.length,
      });
    }
  }

  // Search soil profiles
  for (const s of soilData) {
    const searchText = `${s.state} ${s.district} ${s.typical_soil_type} ${s.soil_reasoning} ${s.suitable_crops.join(" ")}`.toLowerCase();
    const matchCount = words.filter((w) => searchText.includes(w)).length;
    if (matchCount > 0) {
      results.push({
        title: `${s.district}, ${s.state} — ${s.typical_soil_type}`,
        content: `${s.soil_reasoning} Suitable crops: ${s.suitable_crops.join(", ")}. Rainfall: ${s.rainfall_mm_annual}mm/year.${s.nearby_irrigation_scheme ? ` Irrigation: ${s.nearby_irrigation_scheme}` : ""}`,
        source: "soil_profiles",
        relevance: matchCount / words.length,
      });
    }
  }

  // Search price history
  for (const p of priceData) {
    const searchText = `${p.crop} ${p.district} ${p.trend}`.toLowerCase();
    const matchCount = words.filter((w) => searchText.includes(w)).length;
    if (matchCount > 0) {
      results.push({
        title: `${p.crop} price — ${p.year_month}`,
        content: `RM${p.price_per_kg_rm}/kg in ${p.district}. Trend: ${p.trend}.`,
        source: "fama_prices",
        relevance: matchCount / words.length,
      });
    }
  }

  // Sort by relevance and return top N
  results.sort((a, b) => b.relevance - a.relevance);
  return results.slice(0, numResults);
}
