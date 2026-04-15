export interface TMDBShowResult {
  id: number;
  name: string;
  original_name: string;
  first_air_date: string; // "YYYY-MM-DD"
  overview?: string;
  poster_path?: string;
  media_type?: string;
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
  const url = new URL("https://api.themoviedb.org/3/search/multi");
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
        name: r.name || r.title,
        original_name: r.original_name || r.original_title,
        first_air_date: r.first_air_date || r.release_date || "",
        overview: r.overview || "",
        poster_path: r.poster_path ? `https://image.tmdb.org/t/p/w500${r.poster_path}` : undefined,
        media_type: r.media_type || "tv"
      }));
    }
    return [];
  } catch (error) {
    console.error("Fetch error to TMDB:", error);
    return [];
  }
}

export async function getTMDBDetails(id: number, apiKey: string, type: string = "tv"): Promise<TMDBShowResult | null> {
  const url = new URL(`https://api.themoviedb.org/3/${type}/${id}`);
  url.searchParams.append("language", "zh-CN");
  url.searchParams.append("api_key", apiKey);

  try {
    const response = await fetch(url.toString());
    if (!response.ok) return null;
    const r = await response.json();
    return {
      id: r.id,
      name: r.name || r.title,
      original_name: r.original_name || r.original_title,
      first_air_date: r.first_air_date || r.release_date || "",
      overview: r.overview || "",
      poster_path: r.poster_path ? `https://image.tmdb.org/t/p/w500${r.poster_path}` : undefined,
      media_type: type
    };
  } catch (error) {
    return null;
  }
}
