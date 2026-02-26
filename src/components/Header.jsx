export default function Header() {
  const basePath = import.meta.env.BASE_URL || "/";
  return (
    <div className="header">
      <div className="header-inner">
        <img src={`${basePath}lambda.svg`} alt="LAMBDA" className="header-logo" />
        <div className="header-text">
          <h1>LAMBDA (LAnguage Model Bacteriophage Detection Assessment): A Benchmark for Genomic Language Models</h1>
          <p className="citation"><em>Lindsey, et al (2026) doi: XXX.XXXX.XXXX</em></p>
          <p>
            Interactive visualization of genomic language model predictions on 80 bacterial genomes
            with 387 annotated prophage regions. Select a genome from the left panel, then click on
            a ground truth region to zoom in and see per-segment predictions with PHROG functional annotations.
            Use the Plotly toolbar to zoom, pan, and select regions of interest.
          </p>
        </div>
      </div>
    </div>
  );
}
