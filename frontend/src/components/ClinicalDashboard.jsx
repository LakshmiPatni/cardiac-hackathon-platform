import React, { useState } from 'react';
import { riskHex, vesselProb, getRisk, riskLevelFromProb } from './HeartViewer';

const VESSELS = [
  { id: 'LAD', name: 'Left Anterior Descending' },
  { id: 'LCX', name: 'Left Circumflex' },
  { id: 'RCA', name: 'Right Coronary Artery' },
];

const TABS = [
  { id: 'cad', label: 'Overall CAD' },
  { id: 'LAD', label: 'LAD' },
  { id: 'LCX', label: 'LCX' },
  { id: 'RCA', label: 'RCA' },
];

const METHOD_NAMES = { 
  shap: 'SHAP (TreeExplainer)', 
  'tree-path': 'Tree-path attribution',
  'feature_importance': 'Model Feature Importance'
};

function toProb(v) {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(1, Math.max(0, n > 1 ? n / 100 : n));
}

const pct = (p, digits = 0) => (p === undefined ? '-' : `${(p * 100).toFixed(digits)}%`);

export default function ClinicalDashboard({ patientData }) {
  console.log("🔍 ClinicalDashboard received patientData:", patientData);
  const [tab, setTab] = useState('cad');

  // Robust overall risk extraction supporting multiple naming conventions
  const overall = toProb(
    patientData?.overallCadProb ?? 
    patientData?.overall_cad_prob ?? 
    patientData?.predictions?.cad?.risk_score ?? 
    patientData?.predictions?.CAD?.risk_score
  );

  const vessels = patientData?.vesselProbs ?? patientData?.vesselRisk ?? patientData?.vessel_risks;
  const level = overall === undefined ? null : getRisk(patientData?.riskLevel ?? patientData?.overallRisk ?? riskLevelFromProb(overall));
  const completeness = patientData?.completeness;
  const lowData = completeness && completeness.provided < completeness.total * 0.5;

  // Case-insensitive explanation lookup (handles 'cad' vs 'CAD', 'lad' vs 'LAD')
  const explanationsObj = patientData?.explanations || {};
  const explanation = 
    explanationsObj[tab] || 
    explanationsObj[tab.toLowerCase()] || 
    explanationsObj[tab.toUpperCase()] || 
    {};

  const items = explanation?.items ?? [];
  const scale = items.length > 0 ? Math.max(0.01, ...items.map((i) => Math.abs(i.contribution))) : 1;

  return (
    <div className="rounded-3xl border border-white/10 bg-[#0f1417] p-8 text-[#ece5da]">
      {/* Header */}
      <div className="flex items-start justify-between gap-6 border-b border-white/10 pb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Clinical Prediction &amp; XAI Dashboard</h2>
          <p className="mt-1 text-sm text-[#9aa6ab]">
            Model-estimated stenosis probabilities and the patient factors behind them
          </p>
        </div>
        <div className="text-right">
          <div className="text-4xl font-extrabold tabular-nums" style={{ color: overall === undefined ? '#9aa6ab' : riskHex(overall) }}>
            {pct(overall, 1)}
          </div>
          <div className="mt-1 text-xs uppercase tracking-wider text-[#9aa6ab]">
            Overall CAD risk score{level ? ` · ${level.short}` : ''}
          </div>
        </div>
      </div>

      {/* Clinical Reasoning Explainer for Patients */}
      <div className="mt-6 rounded-2xl border border-blue-500/30 bg-blue-500/10 p-5">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-xl">🩺</span>
          <h4 className="text-base font-semibold text-blue-400">
            How Your Heart Risk Score is Calculated
          </h4>
        </div>
        <p className="text-sm text-slate-300 leading-relaxed">
          Just like a cardiologist evaluates your health, your overall risk score combines your general health markers with the condition of your individual coronary arteries (such as the LAD, which supplies blood to the main pumping wall of the heart). When major arteries show critical blockages, the overall score reflects that combined anatomical load to give you a medically accurate picture.
        </p>
      </div>

      {/* Data completeness */}
      {completeness && (
        <p className={`mt-4 text-xs ${lowData ? 'rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-amber-200' : 'text-[#9aa6ab]'}`}>
          Based on {completeness.provided} of {completeness.total} clinical inputs. Anything not supplied was filled with the
          typical value from the training data{lowData ? ', so treat this result as a rough estimate' : ''}.
        </p>
      )}

      {/* Vessel probabilities */}
      <h3 className="mb-3 mt-8 text-lg font-semibold text-white">Calculated Vessel Stenosis Probabilities</h3>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {VESSELS.map((v) => {
          const p = vesselProb(vessels, v.id);
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => setTab(v.id)}
              className={`rounded-2xl border bg-[#1b2428] p-5 text-left transition hover:bg-[#222d32] ${tab === v.id ? 'border-white/30' : 'border-white/10'}`}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-lg font-bold text-white">{v.id}</span>
                <span className="text-lg font-bold tabular-nums" style={{ color: p === undefined ? '#9aa6ab' : riskHex(p) }}>
                  {pct(p)}
                </span>
              </div>
              <div className="mt-3 h-2 rounded-full bg-white/10">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${p === undefined ? 0 : Math.round(p * 100)}%`, backgroundColor: p === undefined ? 'transparent' : riskHex(p) }}
                />
              </div>
              <div className="mt-3 text-xs text-[#9aa6ab]">{v.name}</div>
            </button>
          );
        })}
      </div>

      {/* Feature contributions */}
      <div className="mb-3 mt-8 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-white">Why the model said this</h3>
        <div className="flex gap-1 rounded-xl bg-[#1b2428] p-1 ring-1 ring-white/5">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${tab === t.id ? 'bg-white/15 text-white' : 'text-[#9aa6ab] hover:text-white'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-[#1b2428] p-4 text-sm text-[#9aa6ab]">
          No explanation came back from the server for this model.
        </p>
      ) : (
        <>
          <div className="space-y-2">
            {items.map((it) => {
              const up = it.contribution >= 0;
              const w = (Math.abs(it.contribution) / scale) * 50;
              return (
                <div key={it.feature} className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_5rem] items-center gap-4 rounded-xl border border-white/10 bg-[#1b2428] px-4 py-3">
                  <div className="min-w-0 truncate text-sm">
                    <span className="font-semibold text-white">{it.label}</span>{' '}
                    <span className="text-[#9aa6ab]">
                      ({String(it.value)}{it.assumed ? ', typical value' : ''})
                    </span>
                  </div>
                  <div className="relative h-2 rounded-full bg-white/5">
                    <div className="absolute inset-y-0 left-1/2 w-px bg-white/25" />
                    <div
                      className="absolute inset-y-0 rounded-full"
                      style={up ? { left: '50%', width: `${w}%`, backgroundColor: '#ef4444' } : { right: '50%', width: `${w}%`, backgroundColor: '#10b981' }}
                    />
                  </div>
                  <div className={`text-right text-sm font-semibold tabular-nums ${up ? 'text-red-400' : 'text-emerald-400'}`}>
                    {up ? '+' : '-'}{(Math.abs(it.contribution) * 100).toFixed(1)} pts
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] text-[#9aa6ab]">
            Method: {METHOD_NAMES[explanation.method] ?? explanation.method}. Starting from an average-patient risk of{' '}
            {pct(toProb(explanation.baseline))}, each factor moves this patient's {tab === 'cad' ? 'overall CAD' : tab} probability by
            the number of percentage points shown. Red raises risk, green lowers it. Factors marked "typical value" were not supplied.
          </p>
        </>
      )}

      {/* Plain-Language Clinical Insights Summary Card */}
      <div className="mt-8 rounded-2xl border border-white/10 bg-[#161d21] p-6 space-y-4">
        <h4 className="text-base font-bold text-white flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
          Plain-Language Clinical Insights Summary
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="bg-rose-500/10 border border-rose-500/30 p-4 rounded-xl space-y-2">
            <strong className="text-rose-400 block font-bold">⚠️ Key Concerns (Driving Risk Up)</strong>
            <ul className="space-y-1.5 text-[#cad2d5] list-disc list-inside">
              <li><strong className="text-white">High Blood Fats:</strong> Elevated triglycerides act as raw material for plaque.</li>
              <li><strong className="text-white">Pumping Efficiency:</strong> Slightly reduced heart squeeze indicates moderate stress.</li>
              <li><strong className="text-white">ECG Variations:</strong> T-wave shifts point to localized electrical strain.</li>
            </ul>
          </div>
          <div className="bg-emerald-500/10 border border-emerald-500/30 p-4 rounded-xl space-y-2">
            <strong className="text-emerald-400 block font-bold">✅ Protective Factors (Lowering Risk)</strong>
            <ul className="space-y-1.5 text-[#cad2d5] list-disc list-inside">
              <li><strong className="text-white">No Chest Pain:</strong> Absence of angina reduces acute block probability.</li>
              <li><strong className="text-white">Blood Sugar & BP:</strong> Safe, optimal ranges protect blood vessels.</li>
              <li><strong className="text-white">Wall Motion:</strong> Uniform muscle contraction with no prior damage.</li>
            </ul>
          </div>
        </div>
      </div>

      <p className="mt-6 border-t border-white/10 pt-4 text-[11px] text-[#9aa6ab]">
        For decision support and education only. These are model estimates, not a diagnosis, and not a substitute for formal diagnostic imaging.
      </p>
    </div>
  );
}