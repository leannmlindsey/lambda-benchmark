import { useState, useEffect, useRef } from "react";

/**
 * Hook to fetch and cache per-genome JSON data on demand.
 * @param {string} assembly - Assembly accession (e.g. "GCA_017183795.1")
 * @param {string} windowSize - Window size key (e.g. "2k")
 * @returns {{ data: object|null, loading: boolean, error: string|null }}
 */
export function useGenomeData(assembly, windowSize = "2k") {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const cache = useRef({});

  useEffect(() => {
    if (!assembly) {
      setData(null);
      return;
    }

    const cacheKey = `${assembly}_${windowSize}`;

    if (cache.current[cacheKey]) {
      setData(cache.current[cacheKey]);
      return;
    }

    setLoading(true);
    setError(null);

    const basePath = import.meta.env.BASE_URL || "/";
    fetch(`${basePath}data/${assembly}_${windowSize}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load ${assembly}_${windowSize}.json`);
        return r.json();
      })
      .then((d) => {
        cache.current[cacheKey] = d;
        setData(d);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [assembly, windowSize]);

  return { data, loading, error };
}
