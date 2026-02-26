import { useState, useEffect, useCallback } from "react";
import Header from "./components/Header";
import ControlPanel from "./components/ControlPanel";
import GenomeView from "./components/GenomeView";
import ProphageZoomView from "./components/ProphageZoomView";
import ErrorBoundary from "./components/ErrorBoundary";
import { useGenomeData } from "./hooks/useGenomeData";
import { isComparisonModel } from "./utils/constants";
import "./styles/App.css";

export default function App() {
  // ── State ──────────────────────────────────────────────────────────
  const [genomeList, setGenomeList] = useState([]);
  const [selectedAssembly, setSelectedAssembly] = useState(null);
  const [windowSize, setWindowSize] = useState("2k");
  const [visibleModels, setVisibleModels] = useState(new Set());
  const [activeView, setActiveView] = useState("genome"); // "genome" | "prophage"
  const [selectedProphage, setSelectedProphage] = useState(null);
  const [phylumFilter, setPhylumFilter] = useState(new Set());
  const [sortBy, setSortBy] = useState("avg_mcc");
  const [showRawSignal, setShowRawSignal] = useState(false);

  // ── Load genome index ──────────────────────────────────────────────
  useEffect(() => {
    const basePath = import.meta.env.BASE_URL || "/";
    fetch(`${basePath}data/index.json`)
      .then((r) => r.json())
      .then((data) => {
        setGenomeList(data);
        if (data.length > 0 && !selectedAssembly) {
          setSelectedAssembly(data[0].assembly);
        }
      })
      .catch((err) => console.error("Failed to load index.json:", err));
  }, []);

  // ── Load genome data ───────────────────────────────────────────────
  const { data: genomeData, loading, error } = useGenomeData(
    selectedAssembly,
    windowSize
  );

  // ── Auto-populate visible models when genome data loads ────────────
  // First load: genomic LMs checked, comparison tools unchecked.
  // Window-size switch: remap "Model 2k" → "Model 4k" etc.
  // Genome switch: preserve user's checkbox selections, just drop unavailable models.
  useEffect(() => {
    if (!genomeData) return;
    const availableModels = new Set();
    Object.keys(genomeData.per_segment || {}).forEach((m) => availableModels.add(m));
    Object.keys(genomeData.clustered_predictions || {}).forEach((m) =>
      availableModels.add(m)
    );

    const getDefaultModels = () => {
      const excludedBases = new Set(["ProkBERT-mini-long", "ProkBERT-mini-c"]);
      const defaultComparison = new Set(["PIDE", "PHASTER", "geNomad"]);
      const initial = new Set();
      availableModels.forEach((m) => {
        const base = m.replace(/\s+\d+k$/, "");
        if (excludedBases.has(base)) return;
        if (isComparisonModel(m) && !defaultComparison.has(base)) return;
        initial.add(m);
      });
      return initial;
    };

    setVisibleModels((prev) => {
      if (prev.size === 0) return getDefaultModels();

      // Remap previous selections to the current window size.
      // e.g. "DNABERT2 2k" → "DNABERT2 4k" when switching to 4k.
      const next = new Set();
      prev.forEach((m) => {
        if (availableModels.has(m)) {
          next.add(m);
        } else {
          // Try remapping: strip old size suffix, add current size
          const remapped = m.replace(/\s+\d+k$/, "") + " " + genomeData.window_size;
          if (availableModels.has(remapped)) {
            next.add(remapped);
          }
        }
      });
      // If remap produced nothing (shouldn't happen), fall back to defaults
      return next.size > 0 ? next : getDefaultModels();
    });
  }, [genomeData]);

  // ── Callbacks ──────────────────────────────────────────────────────
  const handleSelectAssembly = useCallback((asm) => {
    setSelectedAssembly(asm);
    setActiveView("genome");
    setSelectedProphage(null);
  }, []);

  const handleToggleModel = useCallback((label) => {
    setVisibleModels((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  }, []);

  const handleTogglePhylum = useCallback((phylum) => {
    setPhylumFilter((prev) => {
      const next = new Set(prev);
      if (next.has(phylum)) {
        next.delete(phylum);
      } else {
        next.add(phylum);
      }
      return next;
    });
  }, []);

  const handleClickProphage = useCallback((index) => {
    setSelectedProphage(index);
    setActiveView("prophage");
  }, []);

  const handleBackToGenome = useCallback(() => {
    setActiveView("genome");
    setSelectedProphage(null);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="app-container">
      <Header />
      <div className="main-layout">
        <ControlPanel
          genomeList={genomeList}
          selectedAssembly={selectedAssembly}
          onSelectAssembly={handleSelectAssembly}
          visibleModels={visibleModels}
          onToggleModel={handleToggleModel}
          phylumFilter={phylumFilter}
          onTogglePhylum={handleTogglePhylum}
          sortBy={sortBy}
          onSetSort={setSortBy}
          windowSize={windowSize}
          onSetWindowSize={setWindowSize}
          genomeData={genomeData}
          showRawSignal={showRawSignal}
          onToggleRawSignal={() => setShowRawSignal((v) => !v)}
        />
        <div className="viz-area">
          {loading && <div className="loading">Loading genome data...</div>}
          {error && <div className="error-msg">Error: {error}</div>}
          {!loading && !error && !genomeData && (
            <div className="empty-state">
              Select a genome from the left panel to begin
            </div>
          )}
          <ErrorBoundary key={selectedAssembly}>
          {!loading && !error && genomeData && activeView === "genome" && (
            <GenomeView
              genomeData={genomeData}
              visibleModels={visibleModels}
              showRawSignal={showRawSignal}
              onClickProphage={handleClickProphage}
            />
          )}
          {!loading &&
            !error &&
            genomeData &&
            activeView === "prophage" &&
            selectedProphage != null && (
              <ProphageZoomView
                genomeData={genomeData}
                prophageIndex={selectedProphage}
                visibleModels={visibleModels}
                onBack={handleBackToGenome}
              />
            )}
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}
