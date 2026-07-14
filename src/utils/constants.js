// Model colors — matching Python scripts (plot_mash_novelty.py, plot_taxonomy_violins.py)
export const MODEL_COLORS = {
  "DNABERT2": "#02afbd",
  "NTv2": "#8fd6d8",
  "ProkBERT-mini": "#f35f73",
  "ProkBERT-mini-long": "#f35f73",
  "ProkBERT-mini-c": "#f35f73",
  "megaDNA": "#ff8ca1",
  "Caduceus": "#97c024",
  "Generanno": "#bbd473",
  "EVO": "#ffb354",
  "EVO2": "#ffcc8f",
  "EVO2 LP": "#e6944c",
  "EVO2+SAE": "#d4763a",
  "GENA-LM": "#b39ddb",
  "ModernGENA": "#7e57c2",
  // Comparison tools
  "geNomad": "#6A3D9A",
  "PhageBoost": "#B15928",
  "PHASTER": "#E31A1C",
  "Phigaro": "#33A02C",
  "PhiSpy": "#1F78B4",
  "VIBRANT": "#FF7F00",
  "VirSorter2": "#A6CEE3",
  "PIDE": "#FB9A99",
};

// Predictions are pre-filtered by the z-score normalization pipeline
// (apply_best_params.py). No client-side filtering is needed.
export const BEST_FILTERS = {};

// PHROG functional category colors
export const CATEGORY_COLORS = {
  "unknown function":                                 "#d9d9d9",
  "DNA; RNA and nucleotide metabolism":               "#02afbd",
  "head and packaging":                               "#f35f73",
  "tail":                                             "#97c024",
  "other":                                            "#ffb354",
  "lysis":                                            "#ff8ca1",
  "connector":                                        "#8fd6d8",
  "transcription regulation":                         "#ffcc8f",
  "integration and excision":                         "#7B68AE",
  "moron; auxiliary metabolic gene and host takeover": "#C4A8D8",
};

// Canonical model order for display — matches Python scripts
export const MODEL_ORDER = [
  "DNABERT2",
  "NTv2",
  "ProkBERT-mini",
  "ProkBERT-mini-long",
  "ProkBERT-mini-c",
  "megaDNA",
  "Caduceus",
  "Generanno",
  "EVO",
  "GENA-LM",
  "ModernGENA",
  "EVO2",
  "EVO2 LP",
  "EVO2+SAE",
];

// Comparison tool order for display
export const COMPARISON_MODEL_ORDER = [
  "geNomad",
  "PhageBoost",
  "PHASTER",
  "Phigaro",
  "PhiSpy",
  "VIBRANT",
  "VirSorter2",
  "PIDE",
];

// Sort model labels into canonical order (genomic LMs first, then comparison tools)
export function sortModels(labels) {
  return [...labels].sort((a, b) => {
    const compA = COMPARISON_MODEL_ORDER.indexOf(a);
    const compB = COMPARISON_MODEL_ORDER.indexOf(b);
    const isCompA = compA !== -1;
    const isCompB = compB !== -1;

    // Genomic LMs before comparison models
    if (isCompA !== isCompB) return isCompA ? 1 : -1;

    // Both comparison models: use comparison order
    if (isCompA && isCompB) return compA - compB;

    // Both genomic LMs: use MODEL_ORDER
    const baseA = getModelBase(a);
    const baseB = getModelBase(b);
    const idxA = MODEL_ORDER.indexOf(baseA);
    const idxB = MODEL_ORDER.indexOf(baseB);
    return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
  });
}

// Check if a model label is a comparison tool (traditional or protein LM)
export function isComparisonModel(label) {
  return COMPARISON_MODEL_ORDER.includes(label);
}

// Sort comparison model labels into canonical order
export function sortComparisonModels(labels) {
  return [...labels].sort((a, b) => {
    const idxA = COMPARISON_MODEL_ORDER.indexOf(a);
    const idxB = COMPARISON_MODEL_ORDER.indexOf(b);
    return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
  });
}

// Extract the base model name from a label like "DNABERT2 2k"
export function getModelBase(label) {
  return label.replace(/\s+\d+k$/, "");
}

// Get model color from a full label
export function getModelColor(label) {
  const base = getModelBase(label);
  return MODEL_COLORS[base] || "#999999";
}

// Check if a model has filter settings
export function getModelFilter(label) {
  return BEST_FILTERS[label] || null;
}

// ── EVO2+SAE display rescaling ─────────────────────────────────────────────
// EVO2+SAE reports SAE "max_activation" magnitudes (~0..12), NOT a 0-1
// probability like every other model. On the shared 0-1 axis those values
// saturate at the top and read as noise. For VISUALIZATION ONLY we rescale its
// per-segment and clustered scores by the global max activation so the signal
// fills the same 0-1 window as the probability models — this makes the
// prophage peaks visible. It does NOT change the precomputed clustering/metrics
// (avg_score is only rescaled for plotting). Divisor = global max activation
// observed across all genomes/window sizes. Set to 0 to disable (revert).
export const EVO2_SAE_ACTIVATION_MAX = 12.125;

function isSaeLabel(label) {
  return label.includes("EVO2+SAE");
}

// Rescale EVO2+SAE per_segment prob and clustered avg_score into [0,1] in place.
export function normalizeSaeScores(data) {
  if (!data || !EVO2_SAE_ACTIVATION_MAX) return data;
  const div = EVO2_SAE_ACTIVATION_MAX;
  const clamp = (v) => Math.min(v / div, 1);
  if (data.per_segment) {
    for (const label of Object.keys(data.per_segment)) {
      if (!isSaeLabel(label)) continue;
      data.per_segment[label] = data.per_segment[label].map(
        (s) => [s[0], s[1], clamp(s[2]), s[3]]
      );
    }
  }
  if (data.clustered_predictions) {
    for (const label of Object.keys(data.clustered_predictions)) {
      if (!isSaeLabel(label)) continue;
      data.clustered_predictions[label] = data.clustered_predictions[label].map(
        (p) => ({ ...p, avg_score: clamp(p.avg_score) })
      );
    }
  }
  return data;
}

// Format genomic coordinates (compact, for labels/buttons)
export function formatBp(bp) {
  if (bp >= 1e6) return `${(bp / 1e6).toFixed(1)} Mb`;
  if (bp >= 1e3) return `${(bp / 1e3).toFixed(0)} kb`;
  return `${bp} bp`;
}

// Format genomic coordinates with exact bp (for hover tooltips)
export function formatBpExact(bp) {
  return `${bp.toLocaleString()} bp`;
}
