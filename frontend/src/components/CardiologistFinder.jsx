import React, { useState } from 'react';

export default function CardiologistFinder({ analysisResult }) {
  const [pincode, setPincode] = useState('');
  const [loading, setLoading] = useState(false);
  const [hospitalData, setHospitalData] = useState(null);
  const [error, setError] = useState(null);

  const riskLevel = analysisResult?.overallCadProb > 0.5 ? 'High' : 'Moderate';
  const API_BASE = import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || "https://cardiac-hackathon-platform.onrender.com";
  const handleAiSearch = async (e) => {
    e.preventDefault();
    if (pincode.length !== 6) return;

    setLoading(true);
    setError(null);

    try {
        const response = await fetch(`${API_BASE}/api/find-specialists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pincode, risk_level: riskLevel }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to retrieve data from AI backend.');
      }

      const data = await response.json();
      setHospitalData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#0f1417] border border-emerald-500/30 rounded-3xl p-6 md:p-8 shadow-xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-xl font-bold">
          🤖
        </div>
        <div>
          <h3 className="text-lg font-bold text-white">AI Care Navigator: Local Specialist Finder</h3>
          <p className="text-xs text-[#8e9a9f]">Connect your risk profile directly with verified government and private cardiology infrastructure.</p>
        </div>
      </div>

      {/* Clinical Triage Notice */}
      <div className="p-4 rounded-2xl bg-[#161d21] border border-white/5 space-y-1 text-xs md:text-sm">
        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block">
          Triage Status: {riskLevel} Risk
        </span>
        <p className="text-[#e2ded5]">
          {riskLevel === 'High'
            ? 'Elevated multi-vessel indicators detected. We recommend booking a consultation with an Interventional Cardiologist.'
            : 'Baseline profile stable. Regular monitoring with a primary physician or general cardiologist is advised.'}
        </p>
      </div>

      {/* PIN input + submit */}
      <form onSubmit={handleAiSearch} className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          maxLength={6}
          value={pincode}
          onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
          placeholder="Enter 6-digit PIN Code (e.g., 400001)"
          className="flex-1 bg-[#070a0c] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-[#8e9a9f] font-mono tracking-widest focus:outline-none focus:border-emerald-500/50 transition"
        />
        <button
          type="submit"
          disabled={loading || pincode.length !== 6}
          className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-bold text-sm rounded-xl transition duration-200 shadow-lg shadow-emerald-500/20"
        >
        {loading ? (
            <div className="flex items-center space-x-2 text-emerald-400">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-emerald-400"></div>
                <span>Searching nearby specialists & analyzing risk profile...</span>
            </div>
        ) : (
            "Find Specialists Nearby"
        )}
        </button>
      </form>

      {error && <p className="text-xs text-rose-400">{error}</p>}

      {hospitalData && (
        <div className="space-y-4 pt-4 border-t border-white/10 animate-fadeIn">
          <div className="text-xs text-emerald-400 font-bold uppercase tracking-wider">
            ✓ Resolved District: {hospitalData.district}, {hospitalData.state}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Government Track */}
            <div className="bg-[#161d21] border border-white/5 rounded-2xl p-4 space-y-3">
              <h4 className="text-xs font-extrabold text-white uppercase tracking-wider">
                🏛️ Government &amp; Public Facilities
              </h4>
              <div className="space-y-2">
                {hospitalData.government_hospitals?.map((h, idx) => (
                  <div key={idx} className="p-3 bg-[#070a0c] rounded-xl border border-white/5 space-y-1">
                    <p className="text-xs font-bold text-emerald-300">{h.name}</p>
                    <p className="text-[11px] text-[#8e9a9f]">{h.address}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Private Track */}
            <div className="bg-[#161d21] border border-white/5 rounded-2xl p-4 space-y-3">
              <h4 className="text-xs font-extrabold text-white uppercase tracking-wider">
                ⭐ Private Heart Institutes
              </h4>
              <div className="space-y-2">
                {hospitalData.private_hospitals?.map((h, idx) => (
                  <div key={idx} className="p-3 bg-[#070a0c] rounded-xl border border-white/5 space-y-1">
                    <p className="text-xs font-bold text-emerald-300">{h.name}</p>
                    <p className="text-[11px] text-[#8e9a9f]">{h.address}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {hospitalData.disclaimer && (
            <p className="text-[10px] text-[#8e9a9f] pt-2 border-t border-white/5">
              ⚠️ {hospitalData.disclaimer}
            </p>
          )}
        </div>
      )}
    </div>
  );
}