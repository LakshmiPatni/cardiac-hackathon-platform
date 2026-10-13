import React from 'react';

export default function ClinicalDisclaimer() {
  return (
    <div className="bg-[#161d21] border border-amber-500/30 rounded-3xl p-6 md:p-8 space-y-4 text-[#ece5da] my-6 shadow-xl">
      <div className="flex items-center gap-3 border-b border-white/10 pb-4">
        <span className="text-2xl">⚠️</span>
        <div>
          <h3 className="font-black text-white text-lg">Clinical Assessment Dashboard</h3>
          <p className="text-xs text-amber-400 font-semibold">AI-generated estimates for research and educational use</p>
        </div>
      </div>

      <div className="space-y-3 text-xs text-[#9aa6ab] leading-relaxed">
        <div>
          <strong className="text-white block mb-1">1. Cardiovascular risk factors</strong>
          <p>Summarizes the clinical measurements and patient characteristics supplied to the model. This is not a substitute for a validated cardiovascular risk calculator or a clinician's assessment.</p>
        </div>

        <div>
          <strong className="text-white block mb-1">2. Coronary vessel estimates</strong>
          <p>Displays separate model estimates for LAD, LCX, and RCA only where the corresponding targets and model performance have been verified. These estimates do not confirm the presence or severity of arterial narrowing.</p>
        </div>

        <div className="bg-black/20 p-3 rounded-xl border border-white/5 space-y-2">
          <p><strong>Clinical note:</strong> Results depend on input completeness, the training dataset, and model validation. A healthcare professional should interpret findings in a clinical context.</p>
          <p>Before presenting this at a hackathon or using it with patient data, validate the models against independent clinical data and have a cardiologist review target definitions, thresholds, and interface language.</p>
        </div>
      </div>

      <div className="border-t border-white/10 pt-4 text-[11px] text-rose-300 font-medium">
        🚨 <strong>Emergency Notice:</strong> If someone is experiencing new or severe chest pain, breathlessness, or other possible heart-attack symptoms, they should seek emergency medical care rather than rely on this dashboard.
      </div>
    </div>
  );
}