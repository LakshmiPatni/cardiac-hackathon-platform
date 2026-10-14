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

## 🛠️ Tech Stack, Platforms & AI Architecture

### **Languages Used**
* **Python**: Backend development (FastAPI), data preprocessing, regex parsing (`pypdf`), and building machine learning pipelines.
* **JavaScript (ES6+) / JSX**: Frontend UI components (React), state management, and rendering 3D graphics in the browser.
* **HTML5 & CSS3 / Tailwind CSS**: Structure, styling, layouts, and responsive UI dashboard elements.

### **Web & Hosting Platforms**
* **Render**: Live FastAPI Python backend server hosting.
* **Vercel**: Live React frontend application hosting.
* **GitHub**: Repository source control, code management, and automated continuous deployment triggers.
* **cron-job.org**: Automated Keep-Alive ping monitoring to eliminate backend cold-start delays on free-tier hosting.

### **AIs, Models & Intelligent Tools Used**
* **Gemini AI**:
  * **System Design & Workflow Architecture**: Assisted in structuring end-to-end full-stack workflows, CIMS system architecture, keep-alive deployment strategies, and demo video script blueprints.
  * **`gemini-flash-2.5` API**: Powers intelligent geolocation mapping, structured JSON response schemas, and real-time retrieval of nearby verified cardiology centers based on Indian PIN codes.
* **Claude**: Assisted in architecting and generating the 3D interactive heart viewer components using WebGL, Three.js, and `@react-three/fiber`.
* **Google Antigravity IDE & AI Agents**: Utilized as an agentic development environment for real-time debugging, automated error resolution, and full-stack project troubleshooting.
* **LightGBM Binary & Multi-Class Classifiers**: Gradient-boosting machine learning models trained for predicting coronary artery disease (CAD) risk and specific vessel stenosis probability (LAD, LCX, RCA).
* **SHAP (SHapley Additive exPlanations)**: Explainable AI framework (`TreeExplainer`) used to calculate feature importance scores and explain individual clinical risk factor contributions.

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

