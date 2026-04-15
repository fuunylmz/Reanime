export interface TMDBShowResult {
  id: number;
  name: string;
  original_name: string;
  first_air_date: string; // "YYYY-MM-DD"
  overview?: string;
}

/**
 * 搜索 TMDB 并返回前 N 个候选结果（默认最多 5 个），
 * 供 LLM 进行二次智能择优。
 */
export async function searchTMDBMultiple(
  query: string,
  apiKey: string,
  maxResults: number = 5
): Promise<TMDBShowResult[]> {
  const url = new URL("https://api.themoviedb.org/3/search/tv");
  url.searchParams.append("query", query);
  url.searchParams.append("language", "zh-CN");
  url.searchParams.append("api_key", apiKey);

  try {
    const response = await fetch(url.toString());
    if (!response.ok) {
      console.error("TMDB search failed:", response.statusText);
      return [];
    }
    const data = await response.json();
    if (data.results && data.results.length > 0) {
      return data.results.slice(0, maxResults).map((r: any) => ({
        id: r.id,
        name: r.name,
        original_name: r.original_name,
        first_air_date: r.first_air_date || "",
        overview: r.overview || "",
      }));
    }
    return [];
  } catch (error) {
    console.error("Fetch error to TMDB:", error);
    return [];
  }
}
