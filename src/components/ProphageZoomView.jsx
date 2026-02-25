import { useMemo, useCallback, useRef } from "react";
import { Plot, Plotly } from "../utils/plotly";
import {
  getModelColor,
  getModelFilter,
  formatBp,
  sortModels,
  isComparisonModel,
  CATEGORY_COLORS,
} from "../utils/constants";

const PADDING = 10000; // 10kb padding on each side

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Zoomed prophage view: raw per-segment signal + PHROG annotations.
 * Shows one GT region with padding, per-segment prob_1 bars, clustered
 * prediction backgrounds, and PHROG functional category blocks.
 */
export default function ProphageZoomView({
  genomeData,
  prophageIndex,
  visibleModels,
  onBack,
}) {
  const { plotData, layout } = useMemo(() => {
    if (!genomeData || prophageIndex == null) return { plotData: [], layout: {} };

    const gt = genomeData.ground_truth[prophageIndex];
    if (!gt) return { plotData: [], layout: {} };

    const viewStart = Math.max(0, gt.start - PADDING);
    const viewEnd = gt.end + PADDING;
    const viewLen = viewEnd - viewStart;

    const models = Object.keys(genomeData.per_segment || {})
      .concat(Object.keys(genomeData.clustered_predictions || {}))
      .filter((m) => visibleModels.has(m));
    const modelList = sortModels([...new Set(models)]);

    const nModels = modelList.length;
    const nRows = nModels + 1; // + PHROG row

    const traces = [];
    const shapes = [];
    const annotations = [];

    modelList.forEach((modelLabel, i) => {
      const yAxisId = i === 0 ? "y" : `y${i + 1}`;
      const color = getModelColor(modelLabel);
      const filter = getModelFilter(modelLabel);
      const clustered = genomeData.clustered_predictions?.[modelLabel] || [];
      const segments = genomeData.per_segment?.[modelLabel] || [];

      // GT region shading
      shapes.push({
        type: "rect",
        xref: "x",
        yref: yAxisId,
        x0: gt.start - viewStart,
        x1: gt.end - viewStart,
        y0: 0,
        y1: 1.05,
        fillcolor: "rgba(0,0,0,0.06)",
        line: { width: 0 },
        layer: "below",
      });

      // Clustered prediction backgrounds (lighter bars at avg_score height)
      const visibleClustered = [];
      if (filter) {
        const [threshold, minSize] = filter;

        clustered.forEach((pred) => {
          const clippedS = Math.max(pred.start, viewStart);
          const clippedE = Math.min(pred.end, viewEnd);
          if (clippedS >= clippedE) return;

          const survives = pred.avg_score >= threshold && pred.size >= minSize;
          const relS = clippedS - viewStart;
          const relE = clippedE - viewStart;

          visibleClustered.push({ ...pred, relS, relE, survives });

          shapes.push({
            type: "rect",
            xref: "x",
            yref: yAxisId,
            x0: relS,
            x1: relE,
            y0: 0,
            y1: pred.avg_score,
            fillcolor: survives
              ? hexToRgba(color, 0.2)
              : "rgba(180,180,180,0.1)",
            line: {
              color: survives ? color : "gray",
              width: survives ? 1.0 : 0.5,
            },
            layer: "below",
          });
        });

        // Invisible hover trace for clustered predictions
        if (visibleClustered.length > 0) {
          traces.push({
            type: "bar",
            x: visibleClustered.map((p) => (p.relS + p.relE) / 2),
            y: visibleClustered.map((p) => p.avg_score),
            width: visibleClustered.map((p) => p.relE - p.relS),
            marker: { color: "rgba(0,0,0,0)" }, // invisible
            xaxis: "x",
            yaxis: yAxisId,
            hovertemplate: visibleClustered.map(
              (p) =>
                `<b>${modelLabel}</b> (clustered pred)<br>` +
                `Pred start: ${formatBp(p.start)}<br>` +
                `Pred end: ${formatBp(p.end)}<br>` +
                `Score: ${p.avg_score.toFixed(3)}<br>` +
                `Size: ${formatBp(p.size)}<br>` +
                `${p.survives ? "SURVIVES filter" : "Filtered out"}<extra></extra>`
            ),
            showlegend: false,
          });
        }

        // Threshold line
        shapes.push({
          type: "line",
          xref: "x",
          yref: yAxisId,
          x0: 0,
          x1: viewLen,
          y0: threshold,
          y1: threshold,
          line: { color: "gray", width: 0.8, dash: "dash" },
        });
      }

      // Raw per-segment prob_1 bars (positive segments only)
      // segments format: [[start, end, prob_1, pred_label], ...]
      const posSegs = segments.filter((s) => {
        const [ss, se, , pl] = s;
        return pl === 1 && se > viewStart && ss < viewEnd;
      });

      if (posSegs.length > 0) {
        traces.push({
          type: "bar",
          x: posSegs.map((s) => {
            const cs = Math.max(s[0], viewStart) - viewStart;
            const ce = Math.min(s[1], viewEnd) - viewStart;
            return (cs + ce) / 2;
          }),
          y: posSegs.map((s) => s[2]),
          width: posSegs.map((s) => {
            const cs = Math.max(s[0], viewStart) - viewStart;
            const ce = Math.min(s[1], viewEnd) - viewStart;
            return ce - cs;
          }),
          marker: {
            color: color,
            opacity: 0.75,
            line: { color: "white", width: 0.3 },
          },
          xaxis: "x",
          yaxis: yAxisId,
          hovertemplate: posSegs.map(
            (s) =>
              `<b>${modelLabel}</b> (segment)<br>` +
              `Seg start: ${formatBp(s[0])}<br>` +
              `Seg end: ${formatBp(s[1])}<br>` +
              `prob_1: ${s[2].toFixed(3)}<extra></extra>`
          ),
          showlegend: false,
        });
      }

      // Model label
      let labelText = modelLabel;
      if (isComparisonModel(modelLabel)) {
        // Comparison models: just show name
      } else if (filter) {
        labelText += `  (threshold=${filter[0]})`;
      } else {
        labelText += "  (raw signal only)";
      }

      annotations.push({
        text: labelText,
        xref: "paper",
        yref: `${yAxisId} domain`,
        x: 0,
        y: 1,
        xanchor: "left",
        yanchor: "top",
        showarrow: false,
        font: { size: 10, color: "#333", family: "Arial" },
        bgcolor: "rgba(255,255,255,0.85)",
        borderpad: 3,
      });
    });

    // ── PHROG annotation row ─────────────────────────────────────────
    const phrogYAxis = nModels === 0 ? "y" : `y${nModels + 1}`;

    // Find matching PHROG annotations for this GT region
    const phrogAnnotations = genomeData.phrog_annotations || [];
    const matchingPhrog = phrogAnnotations.filter((p) => {
      if (p.prophage_start == null) return false;
      return (
        Math.max(p.prophage_start, gt.start) <
        Math.min(p.prophage_end, gt.end)
      );
    });

    // Draw PHROG feature blocks as shapes
    matchingPhrog.forEach((pdata) => {
      (pdata.features || []).forEach((feat) => {
        const absStart = pdata.prophage_start + feat.start - 1;
        const absEnd = pdata.prophage_start + feat.end - 1;
        const clippedS = Math.max(absStart, viewStart) - viewStart;
        const clippedE = Math.min(absEnd, viewEnd) - viewStart;
        if (clippedS >= clippedE) return;

        const catColor = CATEGORY_COLORS[feat.category] || "#999999";

        shapes.push({
          type: "rect",
          xref: "x",
          yref: phrogYAxis,
          x0: clippedS,
          x1: clippedE,
          y0: -0.45,
          y1: 0.45,
          fillcolor: catColor,
          line: { color: "white", width: 0.3 },
        });
      });
    });

    // PHROG backbone line
    shapes.push({
      type: "line",
      xref: "x",
      yref: phrogYAxis,
      x0: 0,
      x1: viewLen,
      y0: 0,
      y1: 0,
      line: { color: "#333", width: 1 },
    });

    // GT region shading on PHROG row
    shapes.push({
      type: "rect",
      xref: "x",
      yref: phrogYAxis,
      x0: gt.start - viewStart,
      x1: gt.end - viewStart,
      y0: -0.55,
      y1: 0.55,
      fillcolor: "rgba(0,0,0,0.04)",
      line: { width: 0 },
      layer: "below",
    });

    annotations.push({
      text: "PHROG Annotations",
      xref: "paper",
      yref: `${phrogYAxis} domain`,
      x: 0,
      y: 0.5,
      xanchor: "left",
      yanchor: "middle",
      showarrow: false,
      font: { size: 10, color: "#333", family: "Arial", weight: "bold" },
      bgcolor: "rgba(255,255,255,0.85)",
      borderpad: 3,
    });

    // Also add invisible bar trace for PHROG hover
    const allFeatures = [];
    matchingPhrog.forEach((pdata) => {
      (pdata.features || []).forEach((feat) => {
        const absStart = pdata.prophage_start + feat.start - 1;
        const absEnd = pdata.prophage_start + feat.end - 1;
        const clippedS = Math.max(absStart, viewStart) - viewStart;
        const clippedE = Math.min(absEnd, viewEnd) - viewStart;
        if (clippedS >= clippedE) return;
        allFeatures.push({ ...feat, clippedS, clippedE });
      });
    });

    if (allFeatures.length > 0) {
      traces.push({
        type: "bar",
        x: allFeatures.map((f) => (f.clippedS + f.clippedE) / 2),
        y: allFeatures.map(() => 0.9),
        width: allFeatures.map((f) => f.clippedE - f.clippedS),
        marker: { color: "rgba(0,0,0,0)" }, // invisible - shapes provide the color
        xaxis: "x",
        yaxis: phrogYAxis,
        hovertemplate: allFeatures.map(
          (f) =>
            `<b>${f.category}</b><br>` +
            `${f.product || "unknown"}<br>` +
            `${f.start} - ${f.end}<extra></extra>`
        ),
        showlegend: false,
      });
    }

    // ── Layout ───────────────────────────────────────────────────────
    const rowHeight = 120;
    const phrogHeight = 60;
    const totalHeight = rowHeight * nModels + phrogHeight + 120;

    const gap = 0.03;
    const phrogFraction = phrogHeight / totalHeight;
    const modelFraction = (1 - phrogFraction - gap * nModels) / Math.max(nModels, 1);

    const yAxes = {};

    // PHROG row: top of the chart
    const phrogKey = nModels === 0 ? "yaxis" : `yaxis${nModels + 1}`;
    yAxes[phrogKey] = {
      domain: [1 - phrogFraction, 1],
      range: [-0.55, 0.55],
      fixedrange: true,
      showticklabels: false,
    };

    // Model rows: below PHROG, top to bottom
    modelList.forEach((_, i) => {
      const top = 1 - phrogFraction - gap - i * (modelFraction + gap);
      const bottom = top - modelFraction;
      const key = i === 0 ? "yaxis" : `yaxis${i + 1}`;
      yAxes[key] = {
        domain: [Math.max(bottom, 0), Math.max(top, 0)],
        range: [0, 1.05],
        fixedrange: true,
        showticklabels: false,
        showgrid: true,
        gridcolor: "rgba(0,0,0,0.06)",
      };
    });

    const prophageLen = gt.end - gt.start;
    const layoutObj = {
      ...yAxes,
      xaxis: {
        range: [0, viewLen],
        autorange: false,
        minallowed: 0,
        maxallowed: viewLen,
        showgrid: false,
        showticklabels: true,
        tickformat: ",d",
        tickfont: { size: 10 },
        title: {
          text: `Genomic position relative to ${gt.start.toLocaleString()} bp`,
          font: { size: 12 },
        },
        side: "bottom",
        rangeslider: { visible: true, thickness: 0.06 },
      },
      height: Math.max(totalHeight, 400),
      margin: { l: 10, r: 10, t: 50, b: 60 },
      shapes,
      annotations,
      barmode: "overlay",
      dragmode: "pan",
      hovermode: "closest",
      title: {
        text:
          `Prophage region ${prophageIndex + 1}: ` +
          `${gt.start.toLocaleString()} – ${gt.end.toLocaleString()} bp ` +
          `(${(prophageLen / 1000).toFixed(1)} kb)  |  ` +
          `+/- ${(PADDING / 1000).toFixed(0)} kb padding`,
        font: { size: 13 },
      },
    };

    return { plotData: traces, layout: layoutObj };
  }, [genomeData, prophageIndex, visibleModels]);

  const plotRef = useRef(null);
  const isClampingRef = useRef(false);

  // Compute viewLen for clamping (must match useMemo)
  const viewLen = useMemo(() => {
    if (!genomeData || prophageIndex == null) return 0;
    const gt = genomeData.ground_truth[prophageIndex];
    if (!gt) return 0;
    const viewStart = Math.max(0, gt.start - PADDING);
    const viewEnd = gt.end + PADDING;
    return viewEnd - viewStart;
  }, [genomeData, prophageIndex]);

  const handleRelayout = useCallback(
    (update) => {
      if (isClampingRef.current) {
        isClampingRef.current = false;
        return;
      }
      if (!viewLen || !plotRef.current?.el) return;

      let x0 = update["xaxis.range[0]"];
      let x1 = update["xaxis.range[1]"];
      if (x0 == null && update["xaxis.range"]) {
        x0 = update["xaxis.range"][0];
        x1 = update["xaxis.range"][1];
      }
      if (x0 == null || x1 == null) return;

      if (x0 < 0 || x1 > viewLen) {
        isClampingRef.current = true;
        Plotly.relayout(plotRef.current.el, {
          "xaxis.range": [Math.max(0, x0), Math.min(viewLen, x1)],
        });
      }
    },
    [viewLen]
  );

  if (!genomeData || prophageIndex == null) return null;

  // Build PHROG legend
  const phrogCategories = Object.entries(CATEGORY_COLORS);

  return (
    <div>
      <button className="back-btn" onClick={onBack}>
        &larr; Back to genome view
      </button>

      <div className="genome-info">
        <div className="organism">{genomeData.organism}</div>
        <div className="details">
          {genomeData.assembly} &mdash;{" "}
          Prophage {prophageIndex + 1} of{" "}
          {genomeData.ground_truth?.length || 0}
          {genomeData.taxonomy?.phylum && ` — ${genomeData.taxonomy.phylum} (GTDB)`}
        </div>
      </div>

      {/* PHROG category legend */}
      <div style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "8px",
        padding: "6px 4px 2px",
        fontSize: "11px",
      }}>
        <span style={{ fontWeight: 600, fontSize: "11px", color: "#333" }}>PHROG categories:</span>
        {phrogCategories.map(([cat, color]) => (
          <span key={cat} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{
              width: 12,
              height: 12,
              backgroundColor: color,
              borderRadius: 2,
              display: "inline-block",
              flexShrink: 0,
            }} />
            {cat}
          </span>
        ))}
      </div>

      <Plot
        ref={plotRef}
        data={plotData}
        layout={layout}
        config={{
          responsive: true,
          displayModeBar: true,
          scrollZoom: true,
        }}
        onRelayout={handleRelayout}
        style={{ width: "100%" }}
      />
    </div>
  );
}
