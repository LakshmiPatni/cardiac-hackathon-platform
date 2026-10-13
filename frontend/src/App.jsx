import React, { useState, useRef } from 'react';
import HeartViewer from './components/HeartViewer';
import PatientDataInput from './components/PatientDataInput';
import ClinicalDashboard from './components/ClinicalDashboard';
import ClinicalDisclaimer from "./components/ClinicalDisclaimer";
import CardiologistFinder from './components/CardiologistFinder';

export default function App() {
  const [analysisResult, setAnalysisResult] = useState(null);
  const resultsRef = useRef(null);
  const navigatorRef = useRef(null); // separate ref for the inner "AI Care Navigator" section (was a duplicate of resultsRef)

  // Control refs (kept). Each comparison viewer hands its OrbitControls to its ref through `externalRef`.
  const controls1Ref = useRef(null);
  const controls2Ref = useRef(null);
  const isSyncing = useRef(false);

  // Manual sync helper (kept for reference / custom use).
  // NOTE: the viewers below are now synchronised with `syncKey`, which also syncs pan, zoom, view buttons and
  // auto-rotate without jitter. Do NOT also call this from onControlsChange on the same viewers: two sync
  // mechanisms at once would fight each other.
  // eslint-disable-next-line no-unused-vars
  const handleSyncControls = (sourceRef, targetRef) => {
    if (isSyncing.current) return;
    isSyncing.current = true;

    const source = sourceRef.current;
    const target = targetRef.current;

    if (source && target) {
      target.object.position.copy(source.object.position);
      target.target.copy(source.target);
      target.update();
    }

    setTimeout(() => {
      isSyncing.current = false;
    }, 10);
  };

  const handleAnalyzeData = (result) => {
    setAnalysisResult(result);
    // Smooth scroll down to comparison section once data is processed
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  return (
    <div className="min-h-screen bg-[#090d0f] text-[#e2ded5] selection:bg-emerald-500 selection:text-black">

      {/* SECTION 1: Layman Introduction */}
      <header className="max-w-5xl mx-auto px-6 pt-12 pb-8 text-center space-y-4">
        <span className="px-4 py-1.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold rounded-full tracking-wider uppercase">
          AI Educational & Diagnostic Tool
        </span>
        <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight">
          Understanding Your Heart's Blood Flow
        </h1>
        <p className="text-sm md:text-base text-[#8e9a9f] max-w-3xl mx-auto leading-relaxed">
          Your heart relies on three main blood vessels (arteries) to feed it oxygen. When plaque builds up in these arteries—a condition called <strong>Coronary Artery Disease (CAD)</strong>—blood flow slows down. This tool uses AI to translate complex lab numbers into an interactive 3D visual map of your heart.
        </p>
      </header>

      <div className="max-w-5xl mx-auto px-4 md:px-6 mb-8">
        <ClinicalDisclaimer />
      </div>

      {/* SECTION 2: Educational Healthy Heart Reference */}
      <section className="max-w-7xl mx-auto px-4 md:px-8 mb-16">
        <div className="bg-[#0f1417] border border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-6">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
                Anatomical Baseline: Healthy Cardiac Model
              </h2>
              <p className="text-xs md:text-sm text-[#8e9a9f] mt-1">
                Explore normal tissue shading and rotate the model to inspect all three primary coronary arteries.
              </p>
            </div>
          </div>

          <div className="h-[580px] w-full rounded-2xl overflow-hidden bg-[#070a0c] border border-white/10 relative shadow-inner">
            <HeartViewer overallRisk={0.08} vesselProbs={{ LAD: 0.05, LCX: 0.05, RCA: 0.05 }} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 text-xs md:text-sm">
            <div className="bg-[#161d21] p-4 rounded-2xl border border-white/5 space-y-1">
              <strong className="text-emerald-400 text-sm block">LAD (Left Anterior Descending)</strong>
              <p className="text-[#8e9a9f] leading-relaxed">Supplies blood to the front wall of your heart. Often called the main supply line.</p>
            </div>
            <div className="bg-[#161d21] p-4 rounded-2xl border border-white/5 space-y-1">
              <strong className="text-emerald-400 text-sm block">LCX (Left Circumflex)</strong>
              <p className="text-[#8e9a9f] leading-relaxed">Wraps around the side and back of the heart tissue to feed the outer muscle.</p>
            </div>
            <div className="bg-[#161d21] p-4 rounded-2xl border border-white/5 space-y-1">
              <strong className="text-emerald-400 text-sm block">RCA (Right Coronary Artery)</strong>
              <p className="text-[#8e9a9f] leading-relaxed">Feeds the right side and bottom chambers of the heart.</p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: Data Input Selection */}
      <section className="max-w-5xl mx-auto px-4 md:px-6 mb-16">
        <PatientDataInput onAnalyzeData={handleAnalyzeData} />
      </section>

      {/* SECTION 4 & 5: Dual 3D Heart Comparison & Diagnostic Dashboard */}
      {analysisResult && (
        <section ref={resultsRef} className="max-w-7xl mx-auto px-4 md:px-8 pb-24 space-y-12 border-t border-white/10 pt-16">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-black text-white tracking-tight">Diagnostic Risk Comparison</h2>
            <p className="text-xs md:text-sm text-[#8e9a9f]">
              Side-by-side anatomical view comparing normal baseline tissue against predicted stenosis for <strong>{analysisResult.patientInfo}</strong>.
            </p>
          </div>

          {/* Synchronized Side-by-Side 3D Comparison Viewers */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            <div className="bg-[#0f1417] border border-white/10 rounded-3xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  Normal Healthy Baseline
                </h3>
                <span className="text-xs px-2.5 py-1 bg-emerald-500/10 text-emerald-400 rounded-lg font-mono">0% Stenosis Risk</span>
              </div>
              <div className="h-[520px] rounded-2xl overflow-hidden bg-[#070a0c] border border-white/10">
                <HeartViewer
                  overallRisk={0.05}
                  vesselProbs={{ LAD: 0.05, LCX: 0.05, RCA: 0.05 }}
                  externalRef={controls1Ref}
                  syncKey="comparison-1"
                />
              </div>
            </div>

            <div className="bg-[#0f1417] border border-emerald-500/40 rounded-3xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  Patient Risk Mapping
                </h3>
                <span className="text-xs px-2.5 py-1 bg-emerald-500/20 text-emerald-300 rounded-lg font-mono font-bold">
                  {Math.round((analysisResult.overallCadProb || 0) * 100)}% Overall Risk
                </span>
              </div>
              <div className="h-[520px] rounded-2xl overflow-hidden bg-[#070a0c] border border-white/10">
                <HeartViewer
                  overallProb={analysisResult.overallCadProb}
                  vesselRisk={analysisResult.vesselRisk || analysisResult.vesselProbs}
                  externalRef={controls2Ref}
                  syncKey="comparison-1"
                />
              </div>
            </div>
          </div>

          {/* 🚀 ADD THIS 3D VIEWER LEGEND KEY HERE */}
          <div className="bg-[#161d21] border border-white/10 rounded-2xl p-4 flex flex-wrap items-center justify-around gap-4 text-xs text-[#8e9a9f] shadow-lg">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
              <span><strong className="text-white">Green (&lt;30%):</strong> Low Risk / Normal Flow</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]" />
              <span><strong className="text-white">Amber (30-50%):</strong> Moderate Risk</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]" />
              <span><strong className="text-white">Red (&gt;50%):</strong> High Stenosis Probability</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-slate-400 border border-white/20" />
              <span><strong className="text-white">White / Grey Tag:</strong> Anatomical Landmark (Aorta/Pulmonary)</span>
            </div>
          </div>

          <div className="max-w-5xl mx-auto bg-[#0f1417] border border-white/10 rounded-3xl p-6 md:p-8 shadow-xl space-y-3">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              Dual-Layer Clinical Assessment Framework
            </h3>
            <p className="text-xs md:text-sm text-[#8e9a9f] leading-relaxed">
              To provide a comprehensive evaluation, our AI analyzes your cardiac health across two distinct, leak-free dimensions:
            </p>
            <ul className="text-xs md:text-sm text-[#8e9a9f] space-y-1.5 list-disc list-inside">
              <li><strong className="text-white">Overall Systemic Risk (Top Score):</strong> Evaluates metabolic health, clinical markers, and ECG electrical patterns independently.</li>
              <li><strong className="text-white">Anatomical Vessel Breakdown (Cards Below):</strong> Evaluates branch-specific blood flow indicators (LAD, LCX, RCA) for localized stenosis.</li>
            </ul>
            <p className="text-xs text-[#8e9a9f]/80 italic mt-2">
              Clinical Note: A patient can exhibit elevated systemic risk due to metabolic or electrical stress before an isolated vessel branch crosses a strict stenosis threshold.
            </p>
          </div>

          {/* Clinical Dashboard with SHAP and Plain-Language Summary */}
          <div className="max-w-5xl mx-auto">
            <ClinicalDashboard patientData={analysisResult} />
          </div>

          {analysisResult && (
            <section ref={navigatorRef} className="space-y-12 my-12">

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">

              </div>

              {/* AI Care Navigator */}
              <div className="max-w-5xl mx-auto mt-12">
                <CardiologistFinder analysisResult={analysisResult} />
              </div>
            </section>
          )}
        </section>
      )}
    </div>
  );
}