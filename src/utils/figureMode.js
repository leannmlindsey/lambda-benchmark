// Manuscript-export layout. When on, renders larger fonts and tighter row
// spacing for figure panels in the paper; when off, the normal responsive
// website layout. Toggled at runtime via the "Manuscript mode" checkbox in the
// control panel — this constant is only the initial/default state on load.
export const MANUSCRIPT_MODE_DEFAULT = false;

// All layout values derived from the manuscript-mode flag. Components call this
// inside their render/useMemo so the layout updates live when the flag toggles.
export function getFigureConfig(manuscriptMode) {
  const FONTS = manuscriptMode
    ? { label: 36, metrics: 39, gtText: 20, xTick: 33, xTitle: 26, phrogLegend: 34 }
    : { label: 28, metrics: 24, gtText: 16, xTick: 18, xTitle: 20, phrogLegend: 18 };
  return {
    FONTS,
    ROW_HEIGHT: manuscriptMode ? 90 : 120,
    ROW_GAP: manuscriptMode ? 0.015 : 0.03,
    // Left margin in px — wide in manuscript mode so labels sit beside the data.
    LEFT_MARGIN: manuscriptMode ? 440 : 20,
    // Right margin in px — wide in manuscript mode to hold the per-row MCC score.
    RIGHT_MARGIN: manuscriptMode ? 200 : 10,
    // In manuscript mode, row labels sit in the left margin (right-anchored just
    // outside the plot area). On the website, they overlay the top-left of each
    // subplot.
    LABEL_X: manuscriptMode ? -0.005 : 0,
    LABEL_XANCHOR: manuscriptMode ? "right" : "left",
    LABEL_Y: manuscriptMode ? 0.5 : 0,
    LABEL_YANCHOR: manuscriptMode ? "middle" : "bottom",
  };
}
