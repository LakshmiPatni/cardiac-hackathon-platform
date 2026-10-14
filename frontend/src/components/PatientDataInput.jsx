import React, { useState } from 'react';

export const SAMPLE_PATIENTS = [
  {
    id: "patient_1",
    label: "Case #1: 66-year-old Female — Low Risk / Normal",
    description: "Clean coronary arteries, no significant vessel stenosis.",
    features: {
      "Age": 66, "Weight": 67, "Length": 158, "Sex": "Fmale", "BMI": 26.84,
      "DM": 0, "HTN": 1, "Current Smoker": 0, "EX-Smoker": 0, "FH": 0,
      "Obesity": "Y", "CRF": "N", "CVA": "N", "Airway disease": "N", "Thyroid Disease": "N",
      "CHF": "N", "DLP": "N", "BP": 100, "PR": 80, "Edema": 0,
      "Weak Peripheral Pulse": "N", "Lung rales": "N", "Systolic Murmur": "N", "Diastolic Murmur": "Y",
      "Typical Chest Pain": 0, "Dyspnea": "Y", "Function Class": 3, "Atypical": "N",
      "Nonanginal": "Y", "Exertional CP": "N", "LowTH Ang": "N", "Q Wave": 0,
      "St Elevation": 0, "St Depression": 1, "Tinversion": 0, "LVH": "N",
      "Poor R Progression": "N", "BBB": "N", "FBS": 78, "CR": 1.2, "TG": 63,
      "LDL": 55, "HDL": 27.0, "BUN": 30, "ESR": 76, "HB": 12.1, "K": 4.4,
      "Na": 142, "WBC": 13000, "Lymph": 18, "Neut": 72, "PLT": 742,
      "EF-TTE": 55, "Region RWMA": 0, "VHD": "Severe"
    }
  },
  {
    id: "patient_2",
    label: "Case #2: 50-year-old Male — High Risk / Critical",
    description: "Single vessel stenosis with moderate risk profile.",
    features: {
      "Age": 50, "Weight": 81, "Length": 165, "Sex": "Male", "BMI": 29.75,
      "DM": 0, "HTN": 1, "Current Smoker": 0, "EX-Smoker": 0, "FH": 0,
      "Obesity": "Y", "CRF": "N", "CVA": "N", "Airway disease": "N", "Thyroid Disease": "N",
      "CHF": "N", "DLP": "Y", "BP": 110, "PR": 80, "Edema": 0,
      "Weak Peripheral Pulse": "N", "Lung rales": "N", "Systolic Murmur": "N", "Diastolic Murmur": "N",
      "Typical Chest Pain": 0, "Dyspnea": "N", "Function Class": 0, "Atypical": "Y",
      "Nonanginal": "N", "Exertional CP": "N", "LowTH Ang": "N", "Q Wave": 0,
      "St Elevation": 0, "St Depression": 0, "Tinversion": 0, "LVH": "N",
      "Poor R Progression": "N", "BBB": "N", "FBS": 71, "CR": 0.7, "TG": 340,
      "LDL": 163, "HDL": 46.0, "BUN": 10, "ESR": 8, "HB": 14.9, "K": 4.5,
      "Na": 144, "WBC": 6900, "Lymph": 22, "Neut": 70, "PLT": 245,
      "EF-TTE": 50, "Region RWMA": 0, "VHD": "N"
    }
  },
  {
    id: "patient_3",
    label: "Case #3: 53-year-old Male —Moderate Risk / Borderline",
    description: "Severe blockage across primary coronary branches.",
    features: {
      "Age": 53, "Weight": 90, "Length": 175, "Sex": "Male", "BMI": 29.39,
      "DM": 0, "HTN": 1, "Current Smoker": 1, "EX-Smoker": 0, "FH": 0,
      "Obesity": "Y", "CRF": "N", "CVA": "N", "Airway disease": "N", "Thyroid Disease": "N",
      "CHF": "N", "DLP": "Y", "BP": 110, "PR": 80, "Edema": 0,
      "Weak Peripheral Pulse": "N", "Lung rales": "N", "Systolic Murmur": "N", "Diastolic Murmur": "N",
      "Typical Chest Pain": 0, "Dyspnea": "N", "Function Class": 0, "Atypical": "N",
      "Nonanginal": "N", "Exertional CP": "N", "LowTH Ang": "N", "Q Wave": 0,
      "St Elevation": 0, "St Depression": 1, "Tinversion": 1, "LVH": "N",
      "Poor R Progression": "N", "BBB": "N", "FBS": 90, "CR": 0.7, "TG": 250,
      "LDL": 155, "HDL": 30.0, "BUN": 8, "ESR": 7, "HB": 15.6, "K": 4.7,
      "Na": 141, "WBC": 5700, "Lymph": 39, "Neut": 52, "PLT": 261,
      "EF-TTE": 50, "Region RWMA": 0, "VHD": "N"
    }
  }
];

export default function PatientDataInput({ onAnalyzeData }) {
  const [inputMode, setInputMode] = useState('preset');
  const [selectedSampleId, setSelectedSampleId] = useState('patient_3');
  const [pdfFile, setPdfFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
      setPdfFile(file);
      setError(null);
    } else {
      setError('Please upload a valid PDF file.');
    }
  };
  const API_BASE = import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || "https://cardiac-hackathon-platform.onrender.com";
  const handleCalculateRisk = async () => {
    setLoading(true);
    setError(null);

    try {
      if (inputMode === 'preset') {
        const selectedProfile = SAMPLE_PATIENTS.find((p) => p.id === selectedSampleId);
        if (!selectedProfile) {
          setError('Please select a profile first.');
          setLoading(false);
          return;
        }
        const API_BASE = import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || "https://cardiac-hackathon-platform.onrender.com";
        const response = await fetch(`${API_BASE}/predict`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ features: selectedProfile.features }),
        });

        if (!response.ok) {
          throw new Error(`Server error (${response.status})`);
        }

        const calculatedResult = await response.json();
        onAnalyzeData(calculatedResult);
      } else {
        if (!pdfFile) {
          setError('Please choose a PDF report file before submitting.');
          setLoading(false);
          return;
        }

        const formData = new FormData();
        formData.append('file', pdfFile);

        const extractRes = await fetch('${API_BASE}/extract-report', {
          method: 'POST',
          body: formData,
        });

        if (!extractRes.ok) {
          const errData = await extractRes.json().catch(() => ({}));
          throw new Error(errData.detail || `PDF text extraction failed (${extractRes.status})`);
        }

        const extractData = await extractRes.json();
        const extractedFeatures = extractData.features;

        const predictRes = await fetch('${API_BASE}/predict', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ features: extractedFeatures }),
        });

        if (!predictRes.ok) {
          throw new Error(`ML Prediction failed (${predictRes.status})`);
        }

        const calculatedResult = await predictRes.json();
        onAnalyzeData(calculatedResult);
      }
    } catch (err) {
      console.error('Calculation Error:', err);
      setError(err.message || 'Backend connection failed. Ensure FastAPI is running on port 8000.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#0f1417] border border-white/10 rounded-3xl p-6 md:p-8 space-y-6 text-[#ece5da]">
      
      {/* Top Mode Selector Tabs */}
      <div className="flex border-b border-white/10 gap-6">
        <button
          type="button"
          onClick={() => setInputMode('preset')}
          className={`pb-3 text-sm font-bold transition-all border-b-2 ${
            inputMode === 'preset'
              ? 'border-emerald-400 text-emerald-400'
              : 'border-transparent text-[#9aa6ab] hover:text-white'
          }`}
        >
          Preset Clinical Profiles
        </button>
        <button
          type="button"
          onClick={() => setInputMode('pdf')}
          className={`pb-3 text-sm font-bold transition-all border-b-2 ${
            inputMode === 'pdf'
              ? 'border-emerald-400 text-emerald-400'
              : 'border-transparent text-[#9aa6ab] hover:text-white'
          }`}
        >
          Upload PDF Medical Report
        </button>
      </div>

      {/* Mode 1: Preset Profiles List */}
      {inputMode === 'preset' && (
        <div className="space-y-3">
          {SAMPLE_PATIENTS.map((patient) => (
            <label
              key={patient.id}
              onClick={() => setSelectedSampleId(patient.id)}
              className={`flex items-start gap-3 p-4 rounded-2xl border cursor-pointer transition-all ${
                selectedSampleId === patient.id
                  ? 'border-emerald-500/50 bg-emerald-950/20 ring-1 ring-emerald-500/30'
                  : 'border-white/5 bg-[#161d21] hover:border-white/20'
              }`}
            >
              <input
                type="radio"
                name="sample-patient"
                checked={selectedSampleId === patient.id}
                onChange={() => setSelectedSampleId(patient.id)}
                className="mt-1 text-emerald-500 focus:ring-emerald-500"
              />
              <div>
                <div className="font-bold text-white">{patient.label}</div>
                <p className="text-xs text-[#9aa6ab] mt-1">{patient.description}</p>
              </div>
            </label>
          ))}
        </div>
      )}

      {/* Mode 2: PDF File Upload Drag-and-Drop Dropzone */}
      {inputMode === 'pdf' && (
        <div className="space-y-4">
          <div className="border-2 border-dashed border-white/15 hover:border-emerald-500/50 rounded-2xl p-8 text-center bg-[#161d21] transition-all">
            <input
              type="file"
              id="pdf-upload"
              accept=".pdf"
              onChange={handleFileChange}
              className="hidden"
            />
            <label htmlFor="pdf-upload" className="cursor-pointer block space-y-3">
              <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-xl font-bold">
                📄
              </div>
              <div>
                <span className="text-sm font-bold text-white block">
                  {pdfFile ? pdfFile.name : 'Click to upload or drag & drop medical PDF report'}
                </span>
                <span className="text-xs text-[#9aa6ab] mt-1 block">
                  Supports catheterization reports, ECG findings, and lab results
                </span>
              </div>
            </label>
          </div>

          {pdfFile && (
            <div className="flex items-center justify-between bg-emerald-950/20 border border-emerald-500/30 p-3 rounded-xl text-xs text-emerald-300">
              <span>Ready for ML parsing: <strong>{pdfFile.name}</strong> ({(pdfFile.size / 1024).toFixed(1)} KB)</span>
              <button
                type="button"
                onClick={() => setPdfFile(null)}
                className="text-rose-400 hover:text-rose-300 font-bold ml-2"
              >
                Remove
              </button>
            </div>
          )}
        </div>
      )}

      {/* Error Message Display */}
      {error && <p className="text-xs text-rose-400 font-semibold">{error}</p>}

      {/* Action Button */}
      <button
        type="button"
        onClick={handleCalculateRisk}
        disabled={loading}
        className="w-full py-4 px-6 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black tracking-wide transition-all disabled:opacity-50 shadow-lg shadow-emerald-500/10"
      >
        {loading
          ? inputMode === 'pdf' ? 'Parsing PDF & Calculating Model Risk...' : 'Calculating Live ML Prediction...'
          : 'Generate 3D Visual Comparison'}
      </button>
    </div>
  );
}