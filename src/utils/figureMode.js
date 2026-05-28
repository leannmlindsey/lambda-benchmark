// Manuscript-export mode. Flip MANUSCRIPT_MODE to true to render larger
// fonts and tighter row spacing for figure panels in the paper, then
// flip back to false before redeploying the site.

export const MANUSCRIPT_MODE = false;

// Manuscript fonts are roughly 2× the website sizes. Row labels move
// into a wider left margin so they don't overlap the data.
export const FONTS = MANUSCRIPT_MODE
  ? { label: 36, metrics: 26, gtText: 20, xTick: 26, xTitle: 26, phrogLegend: 26 }
  : { label: 28, metrics: 24, gtText: 16, xTick: 18, xTitle: 20, phrogLegend: 18 };

export const ROW_HEIGHT = MANUSCRIPT_MODE ? 90 : 120;
export const ROW_GAP = MANUSCRIPT_MODE ? 0.015 : 0.03;
// Left margin in px — wide in manuscript mode so labels sit beside the data.
export const LEFT_MARGIN = MANUSCRIPT_MODE ? 380 : 20;
