import React, { useMemo } from 'react';
import HeartViewer, { extractRisk, getRisk } from './HeartViewer';
import ClinicalDashboard from './ClinicalDashboard';

// Healthy reference: every vessel at 0%, so the heart keeps its natural colour.
const HEALTHY = { LAD: 0, LCX: 0, RCA: 0 };

// Only used while developing (npm run dev) when a result has no vessel numbers at all, so you can still see the
// shading. Never used in a production build.
const DEMO = { LAD: 0.95, LCX: 0.85, RCA: 0.45 };

// A pill coloured by risk level (green / yellow / orange / red)
function Chip({ color, children, className = '' }) {
  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-semibold tabular-nums ${className}`}
      style={{ color, backgroundColor: `${color}1f`, borderColor: `${color}66` }}
    >
      {children}
    </span>
  );
}

export default function DualHeartViewer({ patientData, onReset, paused = false, pulse = false }) {
  const risk = useMemo(() => {
    const r = extractRisk(patientData);
    if (!r.found && import.meta.env.DEV) {
      const demoLevel = extractRisk({ vesselProbs: DEMO }).level;
      return { ...r, vesselRisk: DEMO, overall: r.overall ?? Math.max(...Object.values(DEMO)), level: r.level === 'Normal' ? demoLevel : r.level, isDemo: true };
    }
    return { ...r, isDemo: false };
  }, [patientData]);

  const level = getRisk(risk.level);
  const overallPct = risk.overall === undefined ? null : Math.round(risk.overall * 100);
  const bpm = Number(patientData?.bpm ?? patientData?.clinicalInputs?.PR ?? patientData?.clinicalInputs?.hr) || undefined;
  const healthy = getRisk('Normal');

  return (
    <div className="space-y-6">
      {/* Top action bar */}
      <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-[#0f1417] p-4">
        <div>
          <h2 className="text-lg font-bold text-white">Comparative 3D coronary mapping</h2>
          <p className="text-xs text-[#9aa6ab]">
            Healthy reference vs. {patientData?.filename || patientData?.id || 'the patient'}. Pin colours show each artery's
            risk: green under 30%, yellow 30 to 50%, orange 50 to 75%, red 75% and above. Darker heart muscle means more of
            the wall depends on a high-risk artery.
          </p>
        </div>
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className="shrink-0 rounded-lg bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/20"
          >
            ← Input new patient data
          </button>
        )}
      </div>

      {/* Side-by-side comparison. The shared syncKey makes both cameras move together. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-[#0f1417] p-3">
          <div className="mb-3 flex items-center justify-between gap-3 px-1">
            <div className="flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: healthy.color }} />
              <h3 className="text-base font-bold text-white">Normal healthy baseline</h3>
            </div>
            <Chip color={healthy.color}>0% stenosis risk</Chip>
          </div>
          <HeartViewer
            riskLevel="Normal"
            overallProb={0}
            vesselRisk={HEALTHY}
            syncKey="dual-heart"
            paused={paused}
            className="h-[480px]"
          />
        </div>

        <div className="rounded-2xl border bg-[#0f1417] p-3" style={{ borderColor: `${level.color}55` }}>
          <div className="mb-3 flex items-center justify-between gap-3 px-1">
            <div className="flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: level.color }} />
              <h3 className="text-base font-bold text-white">Patient risk mapping</h3>
            </div>
            {overallPct !== null && <Chip color={level.color}>{overallPct}% overall risk</Chip>}
          </div>
          <HeartViewer
            riskLevel={risk.level}
            overallProb={risk.overall}
            vesselRisk={risk.vesselRisk}
            bpm={bpm}
            pulse={pulse}
            syncKey="dual-heart"
            paused={paused}
            className="h-[480px]"
          />
          {risk.isDemo && (
            <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Demo values are being shown because the result contained no vessel percentages (development mode only).
            </p>
          )}
          {!risk.found && !risk.isDemo && (
            <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              No LAD / LCX / RCA percentages were found in this result, so the heart is shown without shading. Fields received:{' '}
              {risk.keys.length ? risk.keys.join(', ') : 'none'}.
            </p>
          )}
        </div>
      </div>

      {/* Numbers and explanation */}
      <ClinicalDashboard patientData={patientData} />
    </div>
  );
}
