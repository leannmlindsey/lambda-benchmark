import { useMemo, useCallback, useRef } from "react";
import { Plot, Plotly } from "../utils/plotly";
import {
  getModelColor,
  getModelFilter,
  formatBp,
  formatBpExact,
  sortModels,
  isComparisonModel,
  CATEGORY_COLORS,
} from "../utils/constants";
import { MANUSCRIPT_MODE, FONTS, ROW_HEIGHT, ROW_GAP, LEFT_MARGIN } from "../utils/figureMode";

const LABEL_X = MANUSCRIPT_MODE ? -0.005 : 0;
const LABEL_XANCHOR = MANUSCRIPT_MODE ? "right" : "left";
const LABEL_Y = MANUSCRIPT_MODE ? 0.5 : 0;
const LABEL_YANCHOR = MANUSCRIPT_MODE ? "middle" : "bottom";

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
  candidateRegion,
  visibleModels,
  showMetrics,
  onBack,
}) {
  const isCandidate = candidateRegion != null;

  const { plotData, layout } = useMemo(() => {
    if (!genomeData) return { plotData: [], layout: {} };

    // Determine region: GT mode or candidate mode
    const region = isCandidate
      ? { start: candidateRegion.start, end: candidateRegion.end }
      : (prophageIndex != null ? genomeData.ground_truth[prophageIndex] : null);
    if (!region) return { plotData: [], layout: {} };

    const gt = region;

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
      const metrics = genomeData.metrics?.[modelLabel];

      // GT region shading
      shapes.push({
        type: "rect",
        xref: "x",
        yref: yAxisId,
        x0: gt.start,
        x1: gt.end,
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

          visibleClustered.push({ ...pred, clippedS, clippedE, survives });

          shapes.push({
            type: "rect",
            xref: "x",
            yref: yAxisId,
            x0: clippedS,
            x1: clippedE,
            y0: 0,
            y1: pred.avg_score,
            fillcolor: survives
              ? hexToRgba(color, 0.3)
              : "rgba(180,180,180,0.1)",
            line: {
              color: survives ? color : "gray",
              width: survives ? 1.5 : 0.5,
            },
            layer: "below",
          });
        });

        // Invisible hover trace for clustered predictions
        if (visibleClustered.length > 0) {
          traces.push({
            type: "bar",
            x: visibleClustered.map((p) => (p.clippedS + p.clippedE) / 2),
            y: visibleClustered.map((p) => p.avg_score),
            width: visibleClustered.map((p) => p.clippedE - p.clippedS),
            marker: { color: "rgba(0,0,0,0)" }, // invisible
            xaxis: "x",
            yaxis: yAxisId,
            hovertemplate: visibleClustered.map(
              (p) =>
                `<b>${modelLabel}</b> (clustered pred)<br>` +
                `Pred start: ${formatBpExact(p.start)}<br>` +
                `Pred end: ${formatBpExact(p.end)}<br>` +
                `Score: ${p.avg_score.toFixed(3)}<br>` +
                `Size: ${formatBpExact(p.size)}<br>` +
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
          x0: viewStart,
          x1: viewEnd,
          y0: threshold,
          y1: threshold,
          line: { color: "gray", width: 0.8, dash: "dash" },
        });
      } else if (clustered.length > 0) {
        // No filter — show all clustered predictions in model color
        clustered.forEach((pred) => {
          const clippedS = Math.max(pred.start, viewStart);
          const clippedE = Math.min(pred.end, viewEnd);
          if (clippedS >= clippedE) return;

          visibleClustered.push({ ...pred, clippedS, clippedE });

          shapes.push({
            type: "rect",
            xref: "x",
            yref: yAxisId,
            x0: clippedS,
            x1: clippedE,
            y0: 0,
            y1: pred.avg_score,
            fillcolor: hexToRgba(color, 0.3),
            line: { color: color, width: 1.5 },
            layer: "below",
          });
        });

        if (visibleClustered.length > 0) {
          traces.push({
            type: "bar",
            x: visibleClustered.map((p) => (p.clippedS + p.clippedE) / 2),
            y: visibleClustered.map((p) => p.avg_score),
            width: visibleClustered.map((p) => p.clippedE - p.clippedS),
            marker: { color: "rgba(0,0,0,0)" },
            xaxis: "x",
            yaxis: yAxisId,
            hovertemplate: visibleClustered.map(
              (p) =>
                `<b>${modelLabel}</b> (prediction)<br>` +
                `Pred start: ${formatBpExact(p.start)}<br>` +
                `Pred end: ${formatBpExact(p.end)}<br>` +
                `Score: ${p.avg_score.toFixed(3)}<br>` +
                `Size: ${formatBpExact(p.size)}<extra></extra>`
            ),
            showlegend: false,
          });
        }
      }

      // Prediction outlines drawn ABOVE traces so they're visible over raw signal
      visibleClustered.forEach((pred) => {
        shapes.push({
          type: "rect",
          xref: "x",
          yref: yAxisId,
          x0: pred.clippedS,
          x1: pred.clippedE,
          y0: 0,
          y1: pred.avg_score,
          fillcolor: hexToRgba(color, 0.12),
          line: { color: color, width: 3.5 },
          layer: "above",
        });
      });

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
            const cs = Math.max(s[0], viewStart);
            const ce = Math.min(s[1], viewEnd);
            return (cs + ce) / 2;
          }),
          y: posSegs.map((s) => s[2]),
          width: posSegs.map((s) => {
            const cs = Math.max(s[0], viewStart);
            const ce = Math.min(s[1], viewEnd);
            return ce - cs;
          }),
          marker: {
            color: color,
            opacity: 0.3,
            line: { color: "white", width: 0.3 },
          },
          xaxis: "x",
          yaxis: yAxisId,
          hovertemplate: posSegs.map(
            (s) =>
              `<b>${modelLabel}</b> (segment)<br>` +
              `Seg start: ${formatBpExact(s[0])}<br>` +
              `Seg end: ${formatBpExact(s[1])}<br>` +
              `prob_1: ${s[2].toFixed(3)}<extra></extra>`
          ),
          showlegend: false,
        });
      }

      // Model label. Manuscript: in left margin, upper half of row.
      annotations.push({
        text: `<b>${modelLabel}</b>`,
        xref: "paper",
        yref: `${yAxisId} domain`,
        x: LABEL_X,
        y: MANUSCRIPT_MODE ? 0.7 : LABEL_Y,
        xanchor: LABEL_XANCHOR,
        yanchor: MANUSCRIPT_MODE ? "middle" : LABEL_YANCHOR,
        showarrow: false,
        font: { size: FONTS.label, color: "#333", family: "Arial" },
        bgcolor: MANUSCRIPT_MODE ? undefined : "rgba(255,255,255,0.85)",
        borderpad: 2,
      });

      // Metrics — italic. Website: below the subplot, flush left, with MCC.
      // Manuscript: in left margin under the model label, no MCC.
      if (showMetrics && metrics) {
        const safeFixed = (v, d = 2) => {
          const n = Number(v);
          return v != null && v !== "" && !isNaN(n) ? n.toFixed(d) : "N/A";
        };
        const rec = safeFixed(metrics.filt_recall);
        const prec = safeFixed(metrics.filt_precision);
        const metricsText = MANUSCRIPT_MODE
          ? `<i>Recall=${rec}   Prec=${prec}</i>`
          : `<i>MCC=${safeFixed(metrics.filt_mcc)}   Recall=${rec}   Prec=${prec}</i>`;
        annotations.push({
          text: metricsText,
          xref: "paper",
          yref: `${yAxisId} domain`,
          x: MANUSCRIPT_MODE ? LABEL_X : 0,
          y: MANUSCRIPT_MODE ? 0.3 : -0.15,
          xanchor: MANUSCRIPT_MODE ? LABEL_XANCHOR : "left",
          yanchor: MANUSCRIPT_MODE ? "middle" : "top",
          showarrow: false,
          font: { size: FONTS.metrics, color: "#333", family: "Arial" },
          borderpad: 1,
        });
      }
    });

    // ── PHROG annotation row ─────────────────────────────────────────
    const phrogYAxis = nModels === 0 ? "y" : `y${nModels + 1}`;

    // Find matching PHROG annotations for this region
    // In candidate mode, use phrog_features directly from candidateRegion
    // In GT mode, use genomeData.phrog_annotations matched by coordinate overlap
    let allPhrogFeatures = []; // array of {absStart, absEnd, category, product}

    if (isCandidate) {
      // Candidate mode: features are relative to candidate start
      (candidateRegion.phrog_features || []).forEach((feat) => {
        const absStart = candidateRegion.start + feat.start;
        const absEnd = candidateRegion.start + feat.end;
        allPhrogFeatures.push({
          absStart,
          absEnd,
          category: feat.category,
          product: feat.product,
        });
      });
    } else {
      // GT mode: match phrog_annotations by coordinate overlap
      const phrogAnnotations = genomeData.phrog_annotations || [];
      const matchingPhrog = phrogAnnotations.filter((p) => {
        if (p.prophage_start == null) return false;
        return (
          Math.max(p.prophage_start, gt.start) <
          Math.min(p.prophage_end, gt.end)
        );
      });
      matchingPhrog.forEach((pdata) => {
        (pdata.features || []).forEach((feat) => {
          allPhrogFeatures.push({
            absStart: pdata.prophage_start + feat.start - 1,
            absEnd: pdata.prophage_start + feat.end - 1,
            category: feat.category,
            product: feat.product,
          });
        });
      });
    }

    // Draw PHROG feature blocks as shapes
    allPhrogFeatures.forEach((feat) => {
      const clippedS = Math.max(feat.absStart, viewStart);
      const clippedE = Math.min(feat.absEnd, viewEnd);
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

    // PHROG backbone line
    shapes.push({
      type: "line",
      xref: "x",
      yref: phrogYAxis,
      x0: viewStart,
      x1: viewEnd,
      y0: 0,
      y1: 0,
      line: { color: "#333", width: 1 },
    });

    // GT region shading on PHROG row
    shapes.push({
      type: "rect",
      xref: "x",
      yref: phrogYAxis,
      x0: gt.start,
      x1: gt.end,
      y0: -0.55,
      y1: 0.55,
      fillcolor: "rgba(0,0,0,0.04)",
      line: { width: 0 },
      layer: "below",
    });

    annotations.push({
      text: "<b>PHROG Annotations</b>",
      xref: "paper",
      yref: `${phrogYAxis} domain`,
      x: LABEL_X,
      y: LABEL_Y,
      xanchor: LABEL_XANCHOR,
      yanchor: LABEL_YANCHOR,
      showarrow: false,
      font: { size: FONTS.label, color: "#333", family: "Arial" },
      bgcolor: MANUSCRIPT_MODE ? undefined : "rgba(255,255,255,0.85)",
      borderpad: 3,
    });

    // Also add invisible bar trace for PHROG hover
    const visibleFeatures = allPhrogFeatures
      .map((f) => ({
        ...f,
        clippedS: Math.max(f.absStart, viewStart),
        clippedE: Math.min(f.absEnd, viewEnd),
      }))
      .filter((f) => f.clippedS < f.clippedE);

    if (visibleFeatures.length > 0) {
      traces.push({
        type: "bar",
        x: visibleFeatures.map((f) => (f.clippedS + f.clippedE) / 2),
        y: visibleFeatures.map(() => 0.9),
        width: visibleFeatures.map((f) => f.clippedE - f.clippedS),
        marker: { color: "rgba(0,0,0,0)" }, // invisible - shapes provide the color
        xaxis: "x",
        yaxis: phrogYAxis,
        hovertemplate: visibleFeatures.map(
          (f) =>
            `<b>${f.category}</b><br>` +
            `${f.product || "unknown"}<br>` +
            `${formatBpExact(f.absStart)} - ${formatBpExact(f.absEnd)}<extra></extra>`
        ),
        showlegend: false,
      });
    }

    // PHROG category legend (inside chart, centered above PHROG row).
    // Manuscript mode: fixed order with cleaner display labels, wrapped to
    // multiple rows. Website mode: original order from CATEGORY_COLORS.
    const PHROG_LEGEND_ORDER = [
      ["head and packaging", "Head & Packaging"],
      ["tail", "Tail"],
      ["DNA; RNA and nucleotide metabolism", "DNA, RNA & Nucleotide Metabolism"],
      ["connector", "Connector"],
      ["lysis", "Lysis"],
      ["transcription regulation", "Transcription Regulation"],
      ["moron; auxiliary metabolic gene and host takeover", "Moron, AMG & Host Takeover"],
      ["integration and excision", "Integration & Excision"],
      ["other", "Other"],
      ["unknown function", "No PHROG"],
    ];
    const legendPairs = MANUSCRIPT_MODE
      ? PHROG_LEGEND_ORDER.map(([key, display]) => [display, CATEGORY_COLORS[key] || "#999999"])
      : Object.entries(CATEGORY_COLORS);
    const legendParts = legendPairs.map(
      ([label, col]) => `<span style="color:${col}">&#9632;</span> ${label}`
    );
    const perRow = MANUSCRIPT_MODE ? 5 : legendParts.length;
    const legendRows = [];
    for (let i = 0; i < legendParts.length; i += perRow) {
      legendRows.push(legendParts.slice(i, i + perRow).join("&nbsp;&nbsp;&nbsp;"));
    }
    // Manuscript: start at the figure's left edge by using a negative x in
    // paper coords (paper x=0 is the plot's left edge, so negative values
    // sit in the left margin). Website: stay centered in the plot area.
    annotations.push({
      text: legendRows.join("<br>"),
      xref: "paper",
      yref: "paper",
      x: MANUSCRIPT_MODE ? 0.48 : 0.5,
      y: 1,
      xanchor: "center",
      yanchor: "bottom",
      showarrow: false,
      font: { size: FONTS.phrogLegend, color: "#333", family: "Arial" },
      align: "left",
      borderpad: 4,
    });

    // ── Layout ───────────────────────────────────────────────────────
    const rowHeight = ROW_HEIGHT;
    // Manuscript: PHROG row matches the model row height. Website: keep compact.
    const phrogHeight = MANUSCRIPT_MODE ? rowHeight : 50;
    const totalHeight = rowHeight * nModels + phrogHeight + 100;

    const gap = ROW_GAP;
    // Extra breathing room between the PHROG row and the first model row.
    const phrogGap = MANUSCRIPT_MODE ? 0.03 : 0;
    const phrogFraction = phrogHeight / totalHeight;
    const modelFraction =
      (1 - phrogFraction - phrogGap - gap * nModels) / Math.max(nModels, 1);

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
      const top = 1 - phrogFraction - phrogGap - gap - i * (modelFraction + gap);
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

    const layoutObj = {
      ...yAxes,
      xaxis: {
        range: [viewStart, viewEnd],
        autorange: false,
        minallowed: viewStart,
        maxallowed: viewEnd,
        showgrid: false,
        showticklabels: true,
        tickformat: "~s",
        tickfont: { size: FONTS.xTick },
        title: {
          text: "Genomic Position (bp)",
          font: { size: FONTS.xTitle },
        },
        side: "bottom",
        anchor: nModels >= 2 ? `y${nModels}` : "y",
        rangeslider: { visible: true, thickness: 0.06 },
      },
      height: Math.max(totalHeight, 300),
      margin: { l: LEFT_MARGIN, r: 10, t: MANUSCRIPT_MODE ? 120 : 50, b: 60 },
      shapes,
      annotations,
      barmode: "overlay",
      dragmode: "pan",
      hovermode: "closest",
    };

    return { plotData: traces, layout: layoutObj };
  }, [genomeData, prophageIndex, visibleModels, isCandidate, candidateRegion, showMetrics]);

  const plotRef = useRef(null);
  const isClampingRef = useRef(false);

  // Compute view bounds for clamping (must match useMemo)
  const viewBounds = useMemo(() => {
    if (!genomeData) return null;
    const region = isCandidate
      ? { start: candidateRegion.start, end: candidateRegion.end }
      : (prophageIndex != null ? genomeData.ground_truth[prophageIndex] : null);
    if (!region) return null;
    return {
      start: Math.max(0, region.start - PADDING),
      end: region.end + PADDING,
    };
  }, [genomeData, prophageIndex, isCandidate, candidateRegion]);

  const handleRelayout = useCallback(
    (update) => {
      if (isClampingRef.current) {
        isClampingRef.current = false;
        return;
      }
      if (!viewBounds || !plotRef.current?.el) return;

      let x0 = update["xaxis.range[0]"];
      let x1 = update["xaxis.range[1]"];
      if (x0 == null && update["xaxis.range"]) {
        x0 = update["xaxis.range"][0];
        x1 = update["xaxis.range"][1];
      }
      if (x0 == null || x1 == null) return;

      if (x0 < viewBounds.start || x1 > viewBounds.end) {
        isClampingRef.current = true;
        Plotly.relayout(plotRef.current.el, {
          "xaxis.range": [Math.max(viewBounds.start, x0), Math.min(viewBounds.end, x1)],
        });
      }
    },
    [viewBounds]
  );

  if (!genomeData || (!isCandidate && prophageIndex == null)) return null;

  return (
    <div>
      <button className="back-btn" onClick={onBack}>
        &larr; Back to genome view
      </button>

      <div className="genome-info">
        <div className="organism">{genomeData.organism}</div>
        <div className="details">
          {genomeData.assembly} &mdash;{" "}
          {isCandidate
            ? `Candidate #${candidateRegion.candidate_id}`
            : `Prophage ${prophageIndex + 1} of ${genomeData.ground_truth?.length || 0}`}
          {genomeData.taxonomy?.phylum && ` — ${genomeData.taxonomy.phylum} (GTDB)`}
        </div>
        {isCandidate && candidateRegion && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            gap: "2px 12px",
            fontSize: "20px",
            color: "#444",
            marginTop: "4px",
            lineHeight: 1.4,
          }}>
            <span style={{ fontWeight: 600 }}>Classification:</span>
            <span>{candidateRegion.classification || "N/A"}</span>
            <span style={{ fontWeight: 600 }}>Size:</span>
            <span>{formatBpExact(candidateRegion.size)}</span>
            <span style={{ fontWeight: 600 }}>Models:</span>
            <span>{candidateRegion.num_models} ({candidateRegion.models_list})</span>
            <span style={{ fontWeight: 600 }}>Novel:</span>
            <span>{candidateRegion.novel_flag}</span>
            <span style={{ fontWeight: 600 }}>Structural:</span>
            <span>{candidateRegion.structural_pct != null ? candidateRegion.structural_pct + "%" : "N/A"}</span>
            <span style={{ fontWeight: 600 }}>Evidence for phage:</span>
            <span>{candidateRegion.evidence_for_phage || "N/A"}</span>
            <span style={{ fontWeight: 600 }}>Evidence against phage:</span>
            <span>{candidateRegion.evidence_against_phage || "N/A"}</span>
          </div>
        )}
      </div>

      <Plot
        ref={plotRef}
        data={plotData}
        layout={layout}
        config={{
          responsive: true,
          displayModeBar: true,
          modeBarButtonsToRemove: ["toImage"],
          modeBarButtonsToAdd: [
            {
              name: "Download as SVG",
              icon: Plotly.Icons.camera,
              click: (gd) => {
                const filename = isCandidate
                  ? `${genomeData?.assembly || "prophage"}_candidate${candidateRegion?.candidate_id}`
                  : `${genomeData?.assembly || "prophage"}_prophage${(prophageIndex || 0) + 1}`;
                Plotly.relayout(gd, { "xaxis.rangeslider.visible": false }).then(() => {
                  return Plotly.downloadImage(gd, { format: "svg", filename });
                }).then(() => {
                  Plotly.relayout(gd, { "xaxis.rangeslider.visible": true, "xaxis.rangeslider.thickness": 0.06 });
                });
              },
            },
          ],
          scrollZoom: true,
        }}
        onRelayout={handleRelayout}
        style={{ width: "100%" }}
      />
    </div>
  );
}
