# Intelligent Cardiac Risk Assessment & AI Care Navigator Platform
**Multimodal AI Hackathon 2026 — Track A: Cardiovascular Risk Visualization & Prediction**[cite: 10]

[![Frontend Deployment](https://img.shields.io/badge/Frontend-Vercel-black?style=flat&logo=vercel)](https://cardiac-hackathon-platform.vercel.app)
[![Backend API](https://img.shields.io/badge/Backend-FastAPI%20%2F%20Render-teal?style=flat&logo=fastapi)](https://cardiac-hackathon-platform.onrender.com)
[![AI Engine](https://img.shields.io/badge/AI-Google%20Gemini%20(gemini--flash--latest)-blue?style=flat&logo=google)](https://ai.google.dev/)

---

## 🚀 Overview
Cardiovascular disease (CVD) remains a leading global cause of mortality[cite: 9, 10]. Traditional clinical tools yield isolated probability numbers without intuitive visualization or actionable next steps[cite: 9, 10]. This platform bridges predictive clinical triage and real-time healthcare infrastructure routing[cite: 9, 10]. 

It evaluates global systemic and anatomical vessel-specific risks (LAD, LCX, RCA) from manual entries or uploaded PDF lab reports, visualizes them dynamically on a synchronized 3D human heart model, explains the underlying drivers using Explainable AI (SHAP), and routes patients directly to verified medical facilities via postal PIN codes[cite: 8, 9, 10, 11, 12, 13].

---

## 🌟 Core Features

* **Dual-Layer Clinical Risk Engine:** Integrates LightGBM classification pipelines trained on an extended version of the Z-Alizadeh Sani dataset to predict overall CAD alongside individual vessel stenosis (LAD, LCX, RCA)[cite: 9, 13].
* **Synchronized 3D Heart Visualization:** Built using Three.js and `react-three-fiber`[cite: 9, 11]. Features a dual-canvas comparison view where a healthy baseline heart and a patient risk-mapped heart rotate, zoom, and inspect in absolute synchronization[cite: 9].
* **Explainable AI (XAI):** Implements `shap` TreeExplainer attributions to present transparent, factor-by-factor risk drivers alongside data completeness confidence tiers[cite: 9].
* **Automated PDF Report Parsing:** Custom regex-driven document parsing (`pypdf`) extracts patient biomarkers and lab values from raw clinical PDF reports instantly[cite: 9, 10].
* **Real-Time AI Care Navigator:** Powered by Google Gemini (`gemini-flash-latest`), processing regional Indian postal PIN codes to map patients to verified government and private cardiology facilities based on triage severity[cite: 9, 10].

---

## 🛠️ Technology Stack

| Component | Technology / Library | Description |
| :--- | :--- | :--- |
| **Frontend** | React, Tailwind CSS, Vite | Responsive clinician/patient UI hosted on Vercel[cite: 9, 10]. |
| **3D Engine** | Three.js, React Three Fiber, OrbitControls | Interactive anatomical OBJ model rendering[cite: 9, 11]. |
| **Backend API** | FastAPI, Uvicorn (Python) | High-performance asynchronous REST API hosted on Render[cite: 9, 10]. |
| **Machine Learning** | Scikit-learn, LightGBM, Joblib | Stacking meta-learner pipelines and predictive models[cite: 9]. |
| **Explainability** | SHAP | Tree-explainer integration for clinical feature attribution[cite: 9]. |
| **Document Parsing** | pypdf, Regex Engine | Automated extraction from unstructured PDF lab reports[cite: 9, 10]. |
| **Generative AI** | google-generativeai (`gemini-flash-latest`) | Live medical care navigation and hospital infrastructure lookup[cite: 9, 10]. |

---

## 📂 Project Structure

```text
cardiac-hackathon-platform/
├── backend/
│   ├── main.py                  # FastAPI server, endpoints, & Gemini integration
│   ├── train_models.py          # Training script for LightGBM models
│   ├── trained_models/          # Saved model bundle (.joblib files)
│   ├── requirements.txt         # Python dependencies
│   └── extention of Z-Alizadeh sani dataset.xlsx
└── frontend/
    ├── src/
    │   ├── components/          # React components (CardiologistFinder, HeartViewer, etc.)
    │   ├── App.jsx              # Main layout & component orchestration
    │   └── main.jsx             # Entry point
    ├── package.json             # Node dependencies & scripts
    └── vite.config.js           # Vite build configuration