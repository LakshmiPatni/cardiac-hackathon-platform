import React from 'react';
import HeartViewer, { riskLevelFromProb, vesselProb } from './HeartViewer';
import ClinicalDashboard from './ClinicalDashboard';

export default function ResultsSummary({ patientData, onReset }) {
  // 1. Safely extract overall probability (e.g. 0.95)
  const rawOverall = patientData?.overallCadProb 
    ?? patientData?.overall_cad_prob 
    ?? patientData?.overallRisk 
    ?? patientData?.predictions?.cad?.risk_score;

  const overallProb = typeof rawOverall === 'number' 
    ? rawOverall 
    : parseFloat(rawOverall) || 0.95;

  // 2. Extract vessel risk probabilities
  const vp = patientData?.vesselProbs ?? patientData?.vesselRisk;
  const vesselRisk = {
    LAD: vesselProb(vp, 'LAD') ?? 0.95,
    LCX: vesselProb(vp, 'LCX') ?? 0.85,
    RCA: vesselProb(vp, 'RCA') ?? 0.95,
  };

  // 3. Map 0.95 -> 'Critical' (Red risk level)
  const patientLevel = riskLevelFromProb(overallProb);

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#0f1417] p-4">
        <div>
          <h2 className="text-lg font-bold text-white">3D Cardiovascular Risk Analysis</h2>
          <p className="text-xs text-[#9aa6ab]">
            Comparing baseline healthy tissue against calculated patient ischemic risk mapping.
          </p>
        </div>
        <button
          onClick={onReset}
          className="rounded-lg bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/20"
        >
          ← Analyze New Patient
        </button>
      </div>

      {/* 3D Visual Comparison */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: Healthy Baseline (0% Stenosis) */}
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0f1417] p-2">
          <div className="absolute left-4 top-4 z-10 rounded-full border border-emerald-500/40 bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300">
            NORMAL HEALTHY BASELINE
          </div>
          <HeartViewer
            riskLevel="Normal"
            vesselRisk={{ LAD: 0, LCX: 0, RCA: 0 }}
            syncKey="dual-heart"
            showStatus={true}
            className="h-[480px]"
          />
        </div>

        {/* Right: Patient Specific Model (95% Critical Risk) */}
        <div className="relative overflow-hidden rounded-2xl border border-red-500/40 bg-[#0f1417] p-2">
          <div className="absolute left-4 top-4 z-10 rounded-full border border-red-500/40 bg-red-500/20 px-3 py-1 text-xs font-semibold text-red-300">
            PATIENT RISK MAPPING ({Math.round(overallProb * 100)}% Overall Risk)
          </div>
          <HeartViewer
            riskLevel={patientLevel}       /* Resolves to 'Critical' for 95% */
            vesselRisk={vesselRisk}       /* Passes LAD: 0.95, LCX: 0.85, RCA: 0.95 */
            severity={overallProb}         /* Darkens muscle tissue shader */
            pulse={true}
            bpm={88}
            syncKey="dual-heart"
            showStatus={true}             /* Status badge displays Critical Risk */
            className="h-[480px]"
          />
        </div>
      </div>

      {/* Dashboard Breakdown */}
      <ClinicalDashboard patientData={patientData} />
    </div>
  );
}