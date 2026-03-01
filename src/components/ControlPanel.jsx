import { useMemo, useState, useEffect } from "react";
import { getModelColor, sortModels, sortComparisonModels, isComparisonModel } from "../utils/constants";

export default function ControlPanel({
  genomeList,
  selectedAssembly,
  onSelectAssembly,
  visibleModels,
  onToggleModel,
  phylumFilter,
  onTogglePhylum,
  sortBy,
  onSetSort,
  windowSize,
  onSetWindowSize,
  genomeData,
  showRawSignal,
  onToggleRawSignal,
  showCandidates,
  onToggleCandidates,
}) {
  // Get unique phyla with counts
  const phylaInfo = useMemo(() => {
    const counts = {};
    genomeList.forEach((g) => {
      const p = g.phylum || "Other";
      counts[p] = (counts[p] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [genomeList]);

  // Get available window sizes
  const availableSizes = useMemo(() => {
    const sizes = new Set();
    genomeList.forEach((g) => {
      (g.available_sizes || ["2k"]).forEach((s) => sizes.add(s));
    });
    return Array.from(sizes).sort();
  }, [genomeList]);

  const [searchQuery, setSearchQuery] = useState("");

  // Filter and sort genomes
  const filteredGenomes = useMemo(() => {
    let filtered = genomeList;

    // Apply phylum filter
    if (phylumFilter.size > 0) {
      filtered = filtered.filter(
        (g) => phylumFilter.has(g.phylum) || phylumFilter.has("Other") && !g.phylum
      );
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter(
        (g) =>
          g.organism.toLowerCase().includes(q) ||
          g.assembly.toLowerCase().includes(q)
      );
    }

    // Sort
    if (sortBy === "avg_mcc") {
      filtered = [...filtered].sort(
        (a, b) => (b.avg_mcc ?? -1) - (a.avg_mcc ?? -1)
      );
    } else if (sortBy === "num_prophages") {
      filtered = [...filtered].sort(
        (a, b) => b.num_prophages - a.num_prophages
      );
    } else {
      filtered = [...filtered].sort((a, b) =>
        a.organism.localeCompare(b.organism)
      );
    }

    return filtered;
  }, [genomeList, phylumFilter, sortBy, searchQuery]);

  // Auto-select first genome when current selection isn't in filtered list
  useEffect(() => {
    if (filteredGenomes.length > 0 && !filteredGenomes.some((g) => g.assembly === selectedAssembly)) {
      onSelectAssembly(filteredGenomes[0].assembly);
    }
  }, [filteredGenomes, selectedAssembly, onSelectAssembly]);

  // Get model labels from current genome data, split into genomic LMs and comparison tools
  const { genomicLmLabels, comparisonLabels } = useMemo(() => {
    if (!genomeData) return { genomicLmLabels: [], comparisonLabels: [] };
    const allLabels = new Set();
    Object.keys(genomeData.per_segment || {}).forEach((l) => allLabels.add(l));
    Object.keys(genomeData.clustered_predictions || {}).forEach((l) => allLabels.add(l));

    const genomic = [];
    const comparison = [];
    for (const label of allLabels) {
      if (isComparisonModel(label)) {
        comparison.push(label);
      } else {
        genomic.push(label);
      }
    }
    return {
      genomicLmLabels: sortModels(genomic),
      comparisonLabels: sortComparisonModels(comparison),
    };
  }, [genomeData]);

  return (
    <div className="control-panel">
      {/* Window size */}
      {availableSizes.length > 1 && (
        <div className="control-section">
          <h3>Window Size</h3>
          <select
            value={windowSize}
            onChange={(e) => onSetWindowSize(e.target.value)}
          >
            {availableSizes.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      )}

      {/* Sort */}
      <div className="control-section">
        <h3>Sort Genomes</h3>
        <div className="sort-controls">
          {[
            ["organism", "Name"],
            ["avg_mcc", "Avg MCC"],
            ["num_prophages", "# Prophages"],
          ].map(([key, label]) => (
            <button
              key={key}
              className={`sort-btn ${sortBy === key ? "active" : ""}`}
              onClick={() => onSetSort(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Taxonomy filter */}
      <div className="control-section">
        <h3>Filter Genomes by Phylum (GTDB)</h3>
        {phylaInfo.map(([phylum, count]) => (
          <label key={phylum} className="taxonomy-checkbox">
            <input
              type="checkbox"
              checked={phylumFilter.has(phylum)}
              onChange={() => onTogglePhylum(phylum)}
            />
            {phylum} <span>({count})</span>
          </label>
        ))}
      </div>

      {/* Genome selector */}
      <div className="control-section">
        <h3>Genome ({filteredGenomes.length})</h3>
        <div style={{ position: "relative" }}>
          <input
            type="text"
            className="genome-search"
            placeholder="Search by name or GCA..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              style={{
                position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer",
                fontSize: 14, color: "#999", padding: "0 4px", lineHeight: 1,
              }}
              title="Clear search"
            >&times;</button>
          )}
        </div>
        <select
          value={selectedAssembly || ""}
          onChange={(e) => onSelectAssembly(e.target.value)}
        >
          {filteredGenomes.map((g) => (
            <option key={g.assembly} value={g.assembly}>
              {g.organism.length > 35
                ? g.organism.slice(0, 35) + "..."
                : g.organism}{" "}
              ({g.assembly}) — {g.num_prophages} prophage{g.num_prophages !== 1 ? "s" : ""} — MCC:{" "}
              {g.avg_mcc != null ? g.avg_mcc.toFixed(2) : "N/A"}
            </option>
          ))}
        </select>
      </div>

      {/* Genomic Language Models */}
      <div className="control-section">
        <h3>Genomic Language Models <span className="model-header-mcc">MCC</span></h3>
        {genomicLmLabels.map((label) => {
          const color = getModelColor(label);
          const mcc = genomeData?.metrics?.[label]?.filt_mcc;
          return (
            <label key={label} className="model-toggle">
              <input
                type="checkbox"
                checked={visibleModels.has(label)}
                onChange={() => onToggleModel(label)}
                style={{ "--model-color": color }}
              />
              <span
                className="model-color-dot"
                style={{ backgroundColor: color }}
              />
              {label}
              <span className="model-mcc">
                {mcc != null && !isNaN(mcc) ? mcc.toFixed(2) : "\u2014"}
              </span>
            </label>
          );
        })}
        {/* Raw signal toggle — only applies to gLMs */}
        <label className="raw-signal-toggle">
          <input
            type="checkbox"
            checked={showRawSignal}
            onChange={onToggleRawSignal}
          />
          Show raw per-segment signal
        </label>
        {/* Candidate prophages toggle */}
        {genomeData?.candidate_prophages?.length > 0 && (
          <label className="raw-signal-toggle">
            <input
              type="checkbox"
              checked={showCandidates}
              onChange={onToggleCandidates}
            />
            Show candidate prophages ({genomeData.candidate_prophages.length})
          </label>
        )}
      </div>

      {/* Comparison Tools */}
      {comparisonLabels.length > 0 && (
        <div className="control-section comparison-section">
          <h3>Comparison Tools <span className="model-header-mcc">MCC</span></h3>
          {comparisonLabels.map((label) => {
            const color = getModelColor(label);
            const mcc = genomeData?.metrics?.[label]?.filt_mcc;
            return (
              <label key={label} className="model-toggle">
                <input
                  type="checkbox"
                  checked={visibleModels.has(label)}
                  onChange={() => onToggleModel(label)}
                  style={{ "--model-color": color }}
                />
                <span
                  className="model-color-dot"
                  style={{ backgroundColor: color }}
                />
                {label}
                <span className="model-mcc">
                  {mcc != null && !isNaN(mcc) ? mcc.toFixed(2) : "\u2014"}
                </span>
              </label>
            );
          })}
        </div>
      )}

    </div>
  );
}
