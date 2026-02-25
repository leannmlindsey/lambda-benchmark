import { useMemo, useCallback, useRef } from "react";
import { Plot, Plotly } from "../utils/plotly";
import { getModelColor, getModelFilter, formatBp, sortModels, isComparisonModel } from "../utils/constants";

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Genome-wide visualization: GT row at top + one subplot per visible model.
 * Clustered predictions as bars, threshold lines, GT shading.
 * Click on GT region to zoom to prophage view.
 * X-axis clamped to [0, genome_length].
 */
export default function GenomeView({
  genomeData,
  visibleModels,
  showRawSignal,
  onClickProphage,
}) {
  const plotRef = useRef(null);

  const { plotData, layout } = useMemo(() => {
    if (!genomeData) return { plotData: [], layout: {} };

    const models = Object.keys(genomeData.per_segment || {})
      .concat(Object.keys(genomeData.clustered_predictions || {}))
      .filter((m) => visibleModels.has(m));
    const modelList = sortModels([...new Set(models)]);

    const gtRegions = genomeData.ground_truth || [];
    const nModels = modelList.length;

    const traces = [];
    const shapes = [];
    const annotations = [];

    // ── GT row (first row, at the top) ─────────────────────────────
    const gtYAxis = "y";

    if (gtRegions.length > 0) {
      traces.push({
        type: "bar",
        x: gtRegions.map((gt) => (gt.start + gt.end) / 2),
        y: gtRegions.map(() => 1),
        width: gtRegions.map((gt) => gt.end - gt.start),
        marker: { color: "rgba(0,0,0,0.8)" },
        text: gtRegions.map(
          (gt) => `${((gt.end - gt.start) / 1000).toFixed(0)} kb`
        ),
        textposition: "inside",
        textfont: { color: "white", size: 9 },
        xaxis: "x",
        yaxis: gtYAxis,
        hovertemplate: gtRegions.map(
          (gt, idx) =>
            `<b>Ground Truth ${idx + 1}</b><br>` +
            `${formatBp(gt.start)} - ${formatBp(gt.end)}<br>` +
            `Size: ${formatBp(gt.end - gt.start)}<br>` +
            `<i>Click to zoom in</i><extra></extra>`
        ),
        showlegend: false,
        customdata: gtRegions.map((_, idx) => idx),
      });
    }

    annotations.push({
      text: "Ground Truth (Click on a prophage to Zoom in)",
      xref: "paper",
      yref: `${gtYAxis} domain`,
      x: 0,
      y: 0.5,
      xanchor: "left",
      yanchor: "middle",
      showarrow: false,
      font: { size: 10, color: "#333", family: "Arial" },
      bgcolor: "rgba(255,255,255,0.85)",
      borderpad: 3,
    });

    // ── Model rows (below GT) ────────────────────────────────────────
    modelList.forEach((modelLabel, i) => {
      const yAxisId = `y${i + 2}`;
      const xAxisId = "x";
      const color = getModelColor(modelLabel);
      const filter = getModelFilter(modelLabel);
      const clustered = genomeData.clustered_predictions?.[modelLabel] || [];
      const metrics = genomeData.metrics?.[modelLabel];

      // GT shading on this subplot
      gtRegions.forEach((gt) => {
        shapes.push({
          type: "rect",
          xref: xAxisId,
          yref: yAxisId,
          x0: gt.start,
          x1: gt.end,
          y0: 0,
          y1: 1.05,
          fillcolor: "rgba(0,0,0,0.06)",
          line: { width: 0 },
          layer: "below",
        });
      });

      // Threshold line
      if (filter) {
        const [threshold] = filter;
        shapes.push({
          type: "line",
          xref: xAxisId,
          yref: yAxisId,
          x0: 0,
          x1: genomeData.genome_length,
          y0: threshold,
          y1: threshold,
          line: { color: "gray", width: 0.8, dash: "dash" },
        });
      }

      // Clustered prediction bars
      if (clustered.length > 0) {
        if (filter) {
          // Model has filter: split into surviving vs filtered-out
          const surviving = [];
          const filtered_out = [];

          clustered.forEach((pred) => {
            const survives =
              pred.avg_score >= filter[0] && pred.size >= filter[1];
            (survives ? surviving : filtered_out).push(pred);
          });

          if (surviving.length > 0) {
            traces.push({
              type: "bar",
              x: surviving.map((p) => (p.start + p.end) / 2),
              y: surviving.map((p) => p.avg_score),
              width: surviving.map((p) => p.end - p.start),
              marker: { color: color, opacity: 0.7, line: { color: color, width: 0.5 } },
              xaxis: xAxisId,
              yaxis: yAxisId,
              hovertemplate: surviving.map(
                (p) =>
                  `<b>${modelLabel}</b><br>` +
                  `Pred start: ${formatBp(p.start)}<br>` +
                  `Pred end: ${formatBp(p.end)}<br>` +
                  `Score: ${p.avg_score.toFixed(3)}<br>` +
                  `Size: ${formatBp(p.size)}<extra></extra>`
              ),
              showlegend: false,
            });
          }

          if (filtered_out.length > 0) {
            traces.push({
              type: "bar",
              x: filtered_out.map((p) => (p.start + p.end) / 2),
              y: filtered_out.map((p) => p.avg_score),
              width: filtered_out.map((p) => p.end - p.start),
              marker: {
                color: "rgba(180,180,180,0.15)",
                line: { color: "gray", width: 0.3 },
              },
              xaxis: xAxisId,
              yaxis: yAxisId,
              hovertemplate: filtered_out.map(
                (p) =>
                  `<b>${modelLabel}</b> (filtered)<br>` +
                  `Pred start: ${formatBp(p.start)}<br>` +
                  `Pred end: ${formatBp(p.end)}<br>` +
                  `Score: ${p.avg_score.toFixed(3)}<br>` +
                  `Size: ${formatBp(p.size)}<extra></extra>`
              ),
              showlegend: false,
            });
          }
        } else {
          // Model has no filter: show all predictions in model color (unfiltered)
          traces.push({
            type: "bar",
            x: clustered.map((p) => (p.start + p.end) / 2),
            y: clustered.map((p) => p.avg_score),
            width: clustered.map((p) => p.end - p.start),
            marker: { color: color, opacity: 0.7, line: { color: color, width: 0.5 } },
            xaxis: xAxisId,
            yaxis: yAxisId,
            hovertemplate: clustered.map(
              (p) =>
                `<b>${modelLabel}</b> (no filter)<br>` +
                `Pred start: ${formatBp(p.start)}<br>` +
                `Pred end: ${formatBp(p.end)}<br>` +
                `Score: ${p.avg_score.toFixed(3)}<br>` +
                `Size: ${formatBp(p.size)}<extra></extra>`
            ),
            showlegend: false,
          });
        }
      }

      // Per-segment signal when raw signal toggle is on (step scatter — fast)
      if (showRawSignal && !isComparisonModel(modelLabel)) {
        const segments = genomeData.per_segment?.[modelLabel] || [];

        if (segments.length > 0) {
          traces.push({
            type: "scatter",
            mode: "lines",
            x: segments.map((s) => (s[0] + s[1]) / 2),
            y: segments.map((s) => s[2]),
            line: { color: color, width: 0.5, shape: "hvh" },
            fill: "tozeroy",
            fillcolor: hexToRgba(color, 0.25),
            xaxis: xAxisId,
            yaxis: yAxisId,
            hovertemplate:
              `<b>${modelLabel}</b> (segment)<br>` +
              `Position: %{x:,.0f} bp<br>` +
              `prob_1: %{y:.3f}<extra></extra>`,
            showlegend: false,
          });
        }
      }

      // Model label annotation with metrics
      const safeFixed = (v, d = 2) => {
        const n = Number(v);
        return v != null && v !== "" && !isNaN(n) ? n.toFixed(d) : "N/A";
      };

      let labelText = modelLabel;
      if (isComparisonModel(modelLabel)) {
        // Comparison models: just show name, no filter/metric annotations
      } else if (metrics) {
        const mcc = safeFixed(metrics.filt_mcc);
        const rec = safeFixed(metrics.filt_recall);
        const prec = safeFixed(metrics.filt_precision);
        labelText += `   MCC=${mcc}  Recall=${rec}  Prec=${prec}`;
      } else if (clustered.length > 0 && !filter) {
        labelText += "  (no filter applied)";
      } else if (!filter) {
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

    // ── Layout ───────────────────────────────────────────────────────
    const rowHeight = 120;
    const gtRowHeight = 50;
    const totalHeight = rowHeight * nModels + gtRowHeight + 100;

    const gap = 0.03;
    const gtFraction = gtRowHeight / totalHeight;
    const modelFraction =
      nModels > 0
        ? (1 - gtFraction - gap * (nModels + 1)) / nModels
        : 0;

    const yAxes = {};

    // GT row: top of the chart
    yAxes["yaxis"] = {
      domain: [1 - gtFraction, 1],
      range: [0, 1.2],
      fixedrange: true,
      showticklabels: false,
    };

    // Model rows: below GT, top to bottom
    modelList.forEach((_, i) => {
      const top = 1 - gtFraction - gap - i * (modelFraction + gap);
      const bottom = top - modelFraction;
      yAxes[`yaxis${i + 2}`] = {
        domain: [Math.max(bottom, 0), Math.max(top, 0)],
        range: [0, 1.05],
        fixedrange: true,
        showticklabels: false,
        showgrid: true,
        gridcolor: "rgba(0,0,0,0.06)",
      };
    });

    const genomeLen = genomeData.genome_length;
    const layoutObj = {
      ...yAxes,
      xaxis: {
        range: [0, genomeLen],
        autorange: false,
        minallowed: 0,
        maxallowed: genomeLen,
        showgrid: false,
        showticklabels: true,
        tickformat: ",d",
        tickfont: { size: 10 },
        title: { text: "Genomic Position (bp)", font: { size: 12 } },
        side: "bottom",
        rangeslider: { visible: true, thickness: 0.06 },
      },
      height: Math.max(totalHeight, 300),
      margin: { l: 10, r: 10, t: 30, b: 60 },
      shapes,
      annotations,
      barmode: "overlay",
      dragmode: "pan",
      clickmode: "event",
      hovermode: "closest",
    };

    return { plotData: traces, layout: layoutObj };
  }, [genomeData, visibleModels, showRawSignal]);

  const handleClick = useCallback(
    (event) => {
      const point = event.points?.[0];
      if (point?.customdata != null) {
        onClickProphage(point.customdata);
      }
    },
    [onClickProphage]
  );

  // Clamp x-axis to [0, genome_length] on zoom/pan
  const isClampingRef = useRef(false);
  const handleRelayout = useCallback(
    (update) => {
      // Skip if this relayout was triggered by our own clamping
      if (isClampingRef.current) {
        isClampingRef.current = false;
        return;
      }
      if (!genomeData || !plotRef.current?.el) return;
      const genomeLen = genomeData.genome_length;

      // Get the new range from the update
      let x0 = update["xaxis.range[0]"];
      let x1 = update["xaxis.range[1]"];
      // Also handle the array form from rangeslider
      if (x0 == null && update["xaxis.range"]) {
        x0 = update["xaxis.range"][0];
        x1 = update["xaxis.range"][1];
      }

      if (x0 == null || x1 == null) return;

      const needsClamp = x0 < 0 || x1 > genomeLen;
      if (needsClamp) {
        isClampingRef.current = true;
        Plotly.relayout(plotRef.current.el, {
          "xaxis.range": [Math.max(0, x0), Math.min(genomeLen, x1)],
        });
      }
    },
    [genomeData]
  );

  if (!genomeData) return null;

  const gtRegions = genomeData.ground_truth || [];

  return (
    <div>
      <div className="genome-info">
        <div className="organism">{genomeData.organism}</div>
        <div className="details">
          {genomeData.assembly} &mdash; {formatBp(genomeData.genome_length)} &mdash;{" "}
          {gtRegions.length} prophage region(s)
          {genomeData.taxonomy?.phylum && ` — ${genomeData.taxonomy.phylum} (GTDB)`}
        </div>
        {gtRegions.length > 0 && (
          <div className="prophage-buttons">
            <span className="prophage-buttons-label">Zoom to prophage:</span>
            {gtRegions.map((gt, idx) => (
              <button
                key={idx}
                className="prophage-btn"
                onClick={() => onClickProphage(idx)}
              >
                #{idx + 1} ({formatBp(gt.start)} – {formatBp(gt.end)})
              </button>
            ))}
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
          modeBarButtonsToAdd: ["select2d", "lasso2d"],
          scrollZoom: true,
        }}
        onClick={handleClick}
        onRelayout={handleRelayout}
        style={{ width: "100%" }}
      />
    </div>
  );
}
