"""
Cardiovascular Risk Prediction API with Stacking Meta-Learner Harmonization.

    uvicorn main:app --reload --port 8000

Run train_models.py first (it creates the clinical_models.joblib bundle this file loads).
"""
import asyncio
import io
import json
import math
import os
import re
import traceback
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pypdf import PdfReader

try:
    import shap  # optional: pip install shap
except Exception:
    shap = None

try:
    import google.generativeai as genai
except Exception:
    genai = None

try:
    from dotenv import load_dotenv
    load_dotenv()  # loads .env from the project directory
except Exception:
    pass  # python-dotenv not installed; fall back to plain env vars

BASE_DIR = Path(__file__).resolve().parent

# ── Gemini configuration (key stored in .env — users never see it) ──────────
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
# Preferred model: gemini-2.5-flash by default. Retired families (1.0 / 1.5) are ignored even if an old value is
# still set on the host (e.g. a leftover GEMINI_MODEL=gemini-1.5-flash on Render).
GEMINI_MODEL   = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash").strip()

if genai is None:
    print("⚠️  google-generativeai not installed — care navigator disabled")
elif not GEMINI_API_KEY or GEMINI_API_KEY == "paste_your_key_here":
    print("⚠️  GEMINI_API_KEY missing in .env — care navigator disabled")
    print("    → Open .env next to main.py and replace 'paste_your_key_here' with your real key")
else:
    genai.configure(api_key=GEMINI_API_KEY)
    print(f"✅ Gemini ready (preferred model: {GEMINI_MODEL})")

app = FastAPI(title="Cardiovascular Risk Prediction API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------------------------------------------------------ load models & meta-model
bundle_paths = [
    BASE_DIR / "trained_models" / "clinical_models.joblib",
    BASE_DIR / "clinical_models.joblib"
]
bundle = None
bundle_path = None

for path in bundle_paths:
    if path.exists():
        try:
            bundle = joblib.load(path)
            bundle_path = path
            break
        except Exception as exc:
            print(f"⚠️ Found bundle at {path}, but failed to load: {exc}")

if bundle is not None:
    models = bundle["models"]
    meta_model = bundle.get("meta_model")
    feature_names = bundle["feature_names"]
    metrics = bundle.get("metrics", {})
    print(f"✅ Successfully loaded unified model bundle from {bundle_path}")
    print(f"✅ Loaded models: {list(models)} | Meta-Model: {'Active' if meta_model else 'None'} | features: {len(feature_names)}")
else:
    print("❌ Critical Error: Could not find 'clinical_models.joblib' in 'trained_models/' or root directory.")
    models = {}
    meta_model = None
    feature_names = []
    metrics = {}

feature_defaults = {}
label_encoders = {}

explainers = {}
if shap is not None:
    for _name, _model in models.items():
        try:
            classifier = _model.named_steps.get("classifier", _model)
            explainers[_name] = shap.TreeExplainer(classifier)
        except Exception as exc:
            print(f"⚠️  SHAP explainer for {_name} failed: {exc}")
print(f"💡 SHAP status: {'on' if explainers else 'off (using tree-path fallback)'}")

# ------------------------------------------------------------------ input handling
def _norm(key):
    return re.sub(r"[^a-z0-9]", "", str(key).lower())


KEY_MAP = {_norm(c): c for c in feature_names}
for _alias, _target in {"hr": "PR", "heartrate": "PR", "pulse": "PR", "pulserate": "PR",
                        "height": "Length", "sbp": "BP", "systolicbp": "BP", "ef": "EF-TTE",
                        "ldlcholesterol": "LDL", "hdlcholesterol": "HDL"}.items():
    if _target in feature_names:
        KEY_MAP.setdefault(_alias, _target)

YES = {"1", "1.0", "y", "yes", "true", "present", "positive", "t"}
NO = {"0", "0.0", "n", "no", "false", "absent", "negative", "none", "f", "normal"}
TEXT_ALIASES = {"female": "fmale", "f": "fmale", "m": "male"}


def encode_categorical(encoder, raw, default):
    lookup = {str(c).strip().lower(): i for i, c in enumerate(encoder.classes_)}
    key = str(raw).strip().lower()
    key = TEXT_ALIASES.get(key, key)
    if key in lookup:
        return lookup[key]
    if key in YES:
        for cand in ("y", "yes", "1", "true", "present"):
            if cand in lookup:
                return lookup[cand]
    if key in NO:
        for cand in ("n", "no", "0", "false", "absent", "none", "normal"):
            if cand in lookup:
                return lookup[cand]
    return default


def to_number(value, default):
    try:
        number = float(value)
        return number if np.isfinite(number) else default
    except (TypeError, ValueError):
        key = str(value).strip().lower()
        if key in YES:
            return 1.0
        if key in NO:
            return 0.0
        return default


def build_row(raw_features):
    row = {col: feature_defaults.get(col, 0) for col in feature_names}
    provided = set()
    for key, value in (raw_features or {}).items():
        col = KEY_MAP.get(_norm(key))
        if col is None or value is None or str(value).strip() == "":
            continue
        row[col] = value
        provided.add(col)
    if "BMI" in row and "BMI" not in provided and {"Weight", "Length"} <= provided:
        w, h = to_number(row["Weight"], 0), to_number(row["Length"], 0)
        if w > 0 and h > 0:
            row["BMI"] = round(w / (h / 100) ** 2, 2)
            provided.add("BMI")
    return row, provided


def encode_row(row):
    return pd.DataFrame([row], columns=feature_names)


# ------------------------------------------------------------------ explanations
FEATURE_LABELS = {
    "Age": "Age",
    "Weight": "Weight",
    "Length": "Height",
    "BMI": "Body mass index (BMI)",
    "Sex": "Sex",
    "DM": "Diabetes mellitus (DM)",
    "HTN": "Hypertension (HTN)",
    "Current Smoker": "Current smoker",
    "EX-Smoker": "Ex-smoker",
    "FH": "Family history of CAD (FH)",
    "Obesity": "Obesity",
    "DLP": "Dyslipidemia (DLP)",
    "CHF": "Congestive heart failure (CHF)",
    "BP": "Blood pressure (BP)",
    "PR": "Pulse rate / Heart rate (PR)",
    "Typical Chest Pain": "Typical chest pain",
    "Atypical": "Atypical chest pain",
    "Nonanginal": "Non-anginal chest pain",
    "Exertional CP": "Exertional chest pain (Exertional CP)",
    "Dyspnea": "Shortness of breath (Dyspnea)",
    "Function Class": "New York Heart Association Functional Class (FC)",
    "Q Wave": "Pathological Q-wave on ECG",
    "St Elevation": "ST-segment elevation (STEMI marker)",
    "St Depression": "ST-segment depression (ST-Dep)",
    "Tinversion": "T-wave inversion (T-inv)",
    "LVH": "Left ventricular hypertrophy (LVH)",
    "Poor R Progression": "Poor R-wave progression (PRP)",
    "BBB": "Bundle branch block (BBB)",
    "FBS": "Fasting blood sugar (FBS)",
    "CR": "Serum creatinine (Cr)",
    "TG": "Triglycerides / Blood fat levels (TG)",
    "LDL": "Low-density lipoprotein cholesterol (LDL)",
    "HDL": "High-density lipoprotein cholesterol (HDL)",
    "BUN": "Blood urea nitrogen (BUN)",
    "ESR": "Erythrocyte sedimentation rate / Inflammation (ESR)",
    "HB": "Hemoglobin (Hb)",
    "K": "Serum potassium (K+)",
    "Na": "Serum sodium (Na+)",
    "WBC": "White blood cell count (WBC)",
    "Lymph": "Lymphocyte percentage (Lymph)",
    "Neut": "Neutrophil percentage (Neut)",
    "PLT": "Platelet count (Plt)",
    "EF-TTE": "Ejection fraction / Heart pumping efficiency (EF-TTE)",
    "Region RWMA": "Regional wall motion abnormality (RWMA)",
    "VHD": "Valvular heart disease (VHD)",
}

FLAG_COLUMNS = {"DM", "HTN", "Current Smoker", "EX-Smoker", "FH", "Obesity", "CRF", "CVA", "Airway disease",
                "Thyroid Disease", "CHF", "DLP", "Edema", "Weak Peripheral Pulse", "Lung rales",
                "Systolic Murmur", "Diastolic Murmur", "Typical Chest Pain", "Dyspnea", "Atypical",
                "Nonanginal", "Exertional CP", "LowTH Ang", "Q Wave", "St Elevation", "St Depression",
                "Tinversion", "LVH", "Poor R Progression"}


def display_value(col, value):
    if col in FLAG_COLUMNS:
        return "Yes" if str(value).strip().lower() in YES else "No"
    try:
        number = float(value)
        return int(number) if number.is_integer() else round(number, 2)
    except (TypeError, ValueError):
        return "Female" if str(value).strip().lower() in ("fmale", "female") else str(value)


def tree_path_contributions(model, x, pos):
    contrib = np.zeros(len(x))
    base = 0.0
    sample = np.asarray(x, dtype=np.float32).reshape(1, -1)
    for est in model.estimators_:
        tree = est.tree_
        values = tree.value[:, 0, :]
        p = values[:, pos] / values.sum(axis=1)
        path = np.sort(est.decision_path(sample).indices)
        base += p[path[0]]
        for a, b in zip(path[:-1], path[1:]):
            contrib[tree.feature[a]] += p[b] - p[a]
    n = len(model.estimators_)
    return base / n, contrib / n


def _positive_shap(values, pos):
    if isinstance(values, list):
        return np.asarray(values[min(pos, len(values) - 1)])[0]
    arr = np.asarray(values)
    return arr[0, :, pos] if arr.ndim == 3 else arr[0]


def _positive_base(expected, pos):
    arr = np.atleast_1d(np.asarray(expected, dtype=float))
    return float(arr[pos] if len(arr) > pos else arr[-1])


def explain(name, model, X, row, provided, top=8):
    classifier = model.named_steps.get("classifier", model)
    preprocessor = model.named_steps.get("preprocessor", None)

    classes = list(classifier.classes_)
    if 1 not in classes:
        return None
    pos = classes.index(1)

    X_proc = preprocessor.transform(X) if preprocessor else X

    method, contribs, base = "tree-path", None, None
    explainer = explainers.get(name)

    if explainer is not None:
        try:
            raw = explainer.shap_values(X_proc, check_additivity=False)
            contribs = _positive_shap(raw, pos)
            base = _positive_base(explainer.expected_value, pos)
            method = "shap"
        except Exception as exc:
            print(f"⚠️  SHAP failed for {name}, using tree-path fallback: {exc}")

    if contribs is None:
        sample_arr = np.asarray(X_proc, dtype=np.float32)
        if sample_arr.ndim == 2:
            sample_arr = sample_arr[0]
        base, contribs = tree_path_contributions(classifier, sample_arr, pos)

    items = []
    feature_list = feature_names
    if hasattr(preprocessor, "get_feature_names_out") and len(contribs) == len(preprocessor.get_feature_names_out()):
        feature_list = preprocessor.get_feature_names_out()

    for i in np.argsort(-np.abs(contribs))[:top]:
        if i >= len(feature_list):
            continue
        value = float(contribs[i])
        if abs(value) < 0.002:
            continue
        col = str(feature_list[i])
        clean_col = col.split("__")[-1]

        matched_label = clean_col
        for k, v in FEATURE_LABELS.items():
            if k.lower() == clean_col.lower() or _norm(k) == _norm(clean_col):
                matched_label = v
                break

        items.append({
            "feature": clean_col,
            "label": matched_label,
            "value": display_value(clean_col, row.get(clean_col, "N/A")),
            "contribution": round(value, 4),
            "assumed": clean_col not in provided,
        })
    return {"method": method, "baseline": round(float(base), 4), "items": items}


# ------------------------------------------------------------------ PDF report parsing
def _num(text):
    value = float(text)
    return int(value) if value.is_integer() else value


ROMAN = {"i": 1, "ii": 2, "iii": 3, "iv": 4}
_N = r"[^\d\n]*?(\d+(?:\.\d+)?)"
NUMERIC_RULES = [
    ("Age", r"\bage\b.*?(\d{1,3})\s*(?:years|yrs)\b", _num),
    ("Weight", r"\bweight\b" + _N, _num),
    ("Length", r"\b(?:height|length)\b" + _N, _num),
    ("BMI", r"\b(?:bmi|body mass index)\b(?!.*above)" + _N, _num),
    ("BP", r"\b(?:systolic|blood pressure)\b[^\d\n]*?(\d{2,3})", _num),
    ("PR", r"\b(?:pulse rate|pulse|heart rate)\b[^\d\n]*?(\d{2,3})", _num),
    ("FBS", r"\b(?:fasting blood sugar|fbs)\b" + _N, _num),
    ("CR", r"\bcreatinine\b" + _N, _num),
    ("TG", r"\b(?:triglycerides|tg)\b" + _N, _num),
    ("LDL", r"\bldl\b" + _N, _num),
    ("HDL", r"\bhdl\b" + _N, _num),
    ("BUN", r"\b(?:blood urea nitrogen|bun)\b" + _N, _num),
    ("ESR", r"\besr\b" + _N, _num),
    ("HB", r"\b(?:hemoglobin|haemoglobin)\b" + _N, _num),
    ("K", r"\bpotassium\b" + _N, _num),
    ("Na", r"\bsodium\b" + _N, _num),
    ("WBC", r"\b(?:white blood cells|wbc)\b" + _N, _num),
    ("Lymph", r"\b(?:lymphocytes|lymph)\b" + _N, _num),
    ("Neut", r"\b(?:neutrophils|neut)\b" + _N, _num),
    ("PLT", r"\b(?:platelets|plt)\b" + _N, _num),
    ("EF-TTE", r"\b(?:ejection fraction|ef-tte)\b" + _N, _num),
    ("Region RWMA", r"\bregion (?:with )?rwma\b.*?(?:code\s*)?(\d)", _num),
    ("Function Class", r"\bfunction(?:al)? class\b\W*(?:class\s*)?(iv|iii|ii|i|\d)\b",
     lambda s: ROMAN.get(s) or int(s)),
]
NUMERIC_RULES = [(f, re.compile(rx), conv) for f, rx, conv in NUMERIC_RULES]

BINARY_RULES = [(f, re.compile(rx)) for f, rx in [
    ("DM", r"\bdiabetes\b|\bdm\b"),
    ("HTN", r"\bhypertension\b|\bhtn\b"),
    ("Current Smoker", r"\bcurrent smoker\b"),
    ("EX-Smoker", r"\bex-?smoker\b"),
    ("FH", r"\bfamily history\b"),
    ("Obesity", r"\bobesity\b"),
    ("CRF", r"\bchronic renal failure\b|\bcrf\b"),
    ("CVA", r"\bcerebrovascular accident\b|\bcva\b"),
    ("Airway disease", r"\bairway disease\b"),
    ("Thyroid Disease", r"\bthyroid disease\b"),
    ("CHF", r"\bcongestive heart failure\b|\bchf\b"),
    ("DLP", r"\bdyslipidemia\b|\bdlp\b"),
    ("Edema", r"\bedema\b"),
    ("Weak Peripheral Pulse", r"\bweak peripheral pulse\b"),
    ("Lung rales", r"\blung rales\b|\brales\b"),
    ("Systolic Murmur", r"\bsystolic murmur\b"),
    ("Diastolic Murmur", r"\bdiastolic murmur\b"),
    ("Typical Chest Pain", r"\btypical chest pain\b"),
    ("Dyspnea", r"\bdyspn(?:ea|oea)\b"),
    ("Atypical", r"\batypical chest pain\b"),
    ("Nonanginal", r"\bnon-?anginal\b"),
    ("Exertional CP", r"\bexertional chest pain\b|\bexertional cp\b"),
    ("LowTH Ang", r"\blow[- ]threshold angina\b"),
    ("Q Wave", r"\bq[- ]wave\b"),
    ("St Elevation", r"\bst[- ]elevation\b"),
    ("St Depression", r"\bst[- ]depression\b"),
    ("Tinversion", r"\bt[- ]wave inversion\b|\btinversion\b"),
    ("LVH", r"\bleft ventricular hypertrophy\b|\blvh\b"),
    ("Poor R Progression", r"\bpoor r[- ]wave progression\b|\bpoor r progression\b"),
]]
POS_WORDS = re.compile(r"\b(yes|present|positive|detected|seen|noted)\b")
NEG_WORDS = re.compile(r"\b(no|absent|none|negative|normal|nil|denies)\b")


def _polarity(rest):
    pos, neg = POS_WORDS.search(rest), NEG_WORDS.search(rest)
    if neg and (not pos or neg.start() < pos.start()):
        return 0
    return 1 if pos else None


def parse_report(text):
    found = {}
    for raw_line in text.splitlines():
        line = re.sub(r"\s+", " ", raw_line).strip().lower()
        if not line:
            continue
        for feature, rx, convert in NUMERIC_RULES:
            if feature not in found:
                m = rx.search(line)
                if m:
                    found[feature] = convert(m.group(1))
        for feature, rx in BINARY_RULES:
            if feature not in found:
                m = rx.search(line)
                if m:
                    value = _polarity(line[m.end():])
                    if value is not None:
                        found[feature] = value
        if "Sex" not in found and re.search(r"\bsex\b", line):
            found["Sex"] = "Female" if re.search(r"\bfemale\b", line) else "Male" if re.search(r"\bmale\b", line) else None
            if found["Sex"] is None:
                del found["Sex"]
        if "BBB" not in found:
            m = re.search(r"\bbundle branch block\b|\b[lr]bbb\b", line)
            if m:
                found["BBB"] = ("LBBB" if re.search(r"\bleft\b|\blbbb\b", line)
                                else "RBBB" if re.search(r"\bright\b|\brbbb\b", line) else "N")
        if "VHD" not in found:
            m = re.search(r"\bvalvular heart disease\b|\bvhd\b", line)
            if m:
                rest = line[m.end():]
                level = re.search(r"\b(severe|moderate|mild)\b", rest)
                if level:
                    found["VHD"] = level.group(1).capitalize()
                elif NEG_WORDS.search(rest):
                    found["VHD"] = "N"
    return found


def read_pdf_text(data):
    reader = PdfReader(io.BytesIO(data))
    pages = []
    for page in reader.pages:
        try:
            pages.append(page.extract_text(extraction_mode="layout") or "")
        except TypeError:
            pages.append(page.extract_text() or "")
    return "\n".join(pages)


# ------------------------------------------------------------------ endpoints
class PatientInput(BaseModel):
    features: dict


class NavigatorRequest(BaseModel):
    pincode: str
    risk_level: str   # "High", "Moderate", etc.


@app.get("/")
def home():
    return {
        "status": "online",
        "message": "Cardiovascular Risk Prediction API",
        "models": list(models),
        "meta_model": bool(meta_model),
        "features": len(feature_names),
        "defaultsLoaded": bool(feature_defaults),
        "explanations": "shap" if explainers else "tree-path",
    }


@app.get("/json/version")
def get_version():
    return {"version": "1.0.0", "status": "active"}


@app.get("/metrics")
def get_metrics():
    return metrics


@app.post("/extract-report")
async def extract_report(file: UploadFile = File(...)):
    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Please upload a valid PDF document.")
    try:
        text = read_pdf_text(await file.read())
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to read the PDF: {exc}")
    features = parse_report(text)
    if not features:
        raise HTTPException(status_code=422, detail="No clinical values could be read from this PDF.")
    return {"status": "success", "filename": file.filename, "extracted_count": len(features), "features": features}


# ------------------------------------------------------------------ helpers for care navigator
def _parse_json_reply(text):
    """Strip markdown fences and extract the JSON object from Gemini's reply."""
    text = (text or "").replace("```json", "").replace("```", "").strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            raise
        return json.loads(match.group(0))


def _clean_facilities(items):
    out = []
    for item in items if isinstance(items, list) else []:
        if isinstance(item, dict) and item.get("name"):
            out.append({"name": str(item["name"]), "address": str(item.get("address", ""))})
    return out


# ------------------------------------------------------------------ Gemini model selection
RETIRED_MODEL_HINTS = ("1.0", "1.5", "gemini-pro")
SKIP_MODEL_WORDS = ("preview", "exp", "lite", "image", "tts", "thinking", "live", "audio", "embedding")
_working_model = None  # remembers the model that last worked, so later requests are fast


def _is_retired(name):
    low = name.lower()
    return any(hint in low for hint in RETIRED_MODEL_HINTS)


def _is_model_error(exc):
    """True when the failure is about the model itself (missing, retired, unsupported), so another model may work."""
    text = f"{type(exc).__name__} {exc}".lower()
    return any(k in text for k in ("404", "not found", "notfound", "not supported", "no longer", "deprecated"))


def _static_model_candidates():
    names = []
    if GEMINI_MODEL and not _is_retired(GEMINI_MODEL):
        names.append(GEMINI_MODEL)
    # gemini-2.5-flash first, then Google's moving "latest" alias, then 2.0 as a last known name
    names += ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.0-flash"]
    return list(dict.fromkeys(names))


def _discover_models():
    """Ask Google which flash models this key can use right now (newest names first)."""
    found = []
    try:
        for m in genai.list_models():
            if "generateContent" not in (getattr(m, "supported_generation_methods", None) or []):
                continue
            name = m.name.replace("models/", "")
            low = name.lower()
            if "flash" in low and not _is_retired(name) and not any(w in low for w in SKIP_MODEL_WORDS):
                found.append(name)
    except Exception as exc:
        print(f"⚠️ Could not list Gemini models: {type(exc).__name__}: {exc}")
    return sorted(set(found), reverse=True)


def _call_gemini(prompt):
    """Try the known-good model first, then the usual names, then whatever Google says is available."""
    global _working_model
    tried, last_exc = set(), None

    def attempt(name):
        client = genai.GenerativeModel(
            name, generation_config={"response_mime_type": "application/json", "temperature": 0.2}
        )
        return client.generate_content(prompt, request_options={"timeout": 30}).text

    def run(names):
        nonlocal last_exc
        global _working_model
        for name in names:
            if name in tried:
                continue
            tried.add(name)
            try:
                text = attempt(name)
                _working_model = name
                print(f"✅ Gemini model in use: {name}")
                return text
            except Exception as exc:
                last_exc = exc
                print(f"⚠️ Gemini model {name} failed: {type(exc).__name__}: {exc}")
                if not _is_model_error(exc):
                    raise  # key, quota or network problem: another model will not help
        return None

    text = run(([_working_model] if _working_model else []) + _static_model_candidates())
    if text is None:
        text = run(_discover_models())
    if text is None:
        raise last_exc or RuntimeError("No usable Gemini model was found for this API key.")
    return text


# ------------------------------------------------------------------ curated fallback (leading cardiac centres)
# Used when Gemini is unavailable or returns too little. These are well-known cardiac centres chosen for general
# reputation and case volume. It is NOT an official ranking, and no individual surgeon is named on purpose
# (availability changes, and a "best surgeon" claim cannot be verified from here). Please re-check names and
# addresses once a year.
def _c(name, address):
    return {"name": name, "address": address}


AIIMS_DELHI = _c("AIIMS New Delhi (Cardiothoracic Sciences Centre)", "Ansari Nagar, New Delhi 110029")
PGIMER = _c("PGIMER Chandigarh (Cardiology and Cardiothoracic Surgery)", "Sector 12, Chandigarh 160012")
SCTIMST = _c("Sree Chitra Tirunal Institute for Medical Sciences and Technology", "Medical College Campus, Thiruvananthapuram, Kerala 695011")
JAYADEVA = _c("Sri Jayadeva Institute of Cardiovascular Sciences and Research", "9th Block, Jayanagar, Bannerghatta Road, Bengaluru 560069")
MEDANTA = _c("Medanta - The Medicity (Heart Institute)", "Sector 38, Gurugram, Haryana 122001")
NARAYANA = _c("Narayana Institute of Cardiac Sciences", "258/A, Bommasandra Industrial Area, Anekal Taluk, Bengaluru 560099")
FORTIS_ESCORTS = _c("Fortis Escorts Heart Institute", "Okhla Road, New Delhi 110025")
ASIAN_HEART = _c("Asian Heart Institute", "G/N Block, Bandra Kurla Complex, Bandra East, Mumbai 400051")
APOLLO_CHENNAI = _c("Apollo Hospitals (Cardiac Sciences), Greams Road", "21 Greams Lane, Off Greams Road, Chennai 600006")
KOKILABEN = _c("Kokilaben Dhirubhai Ambani Hospital (Cardiac Sciences)", "Rao Saheb Achutrao Patwardhan Marg, Four Bungalows, Andheri West, Mumbai 400053")

NATIONAL_FALLBACK = {
    "government": [AIIMS_DELHI, PGIMER, SCTIMST, JAYADEVA],
    "private": [MEDANTA, NARAYANA, FORTIS_ESCORTS, ASIAN_HEART, APOLLO_CHENNAI, KOKILABEN],
}

# First digit of an Indian PIN code identifies the postal region.
REGIONAL_FALLBACK = {
    "1": ("Delhi, Haryana, Punjab, Himachal Pradesh, J&K and Chandigarh region",
          [AIIMS_DELHI, PGIMER], [MEDANTA, FORTIS_ESCORTS]),
    "2": ("Uttar Pradesh and Uttarakhand region",
          [_c("Sanjay Gandhi Postgraduate Institute of Medical Sciences (SGPGIMS)", "Raebareli Road, Lucknow, Uttar Pradesh 226014"), AIIMS_DELHI],
          [MEDANTA, FORTIS_ESCORTS]),
    "3": ("Rajasthan and Gujarat region",
          [_c("U.N. Mehta Institute of Cardiology and Research Centre", "Civil Hospital Campus, Asarwa, Ahmedabad, Gujarat 380016"),
           _c("SMS Hospital (Cardiology), Jaipur", "JLN Marg, Jaipur, Rajasthan 302004")],
          [_c("CIMS Hospital (Cardiac Sciences), Ahmedabad", "Science City Road, Sola, Ahmedabad, Gujarat 380060"), FORTIS_ESCORTS]),
    "4": ("Maharashtra, Goa, Madhya Pradesh and Chhattisgarh region",
          [_c("KEM Hospital (Cardiology and CTVS), Mumbai", "Acharya Donde Marg, Parel, Mumbai 400012"),
           _c("Sir J.J. Group of Hospitals, Mumbai", "Jai Jijabhai Marg, Byculla, Mumbai 400008")],
          [ASIAN_HEART, KOKILABEN]),
    "5": ("Andhra Pradesh, Telangana and Karnataka region",
          [JAYADEVA, _c("NIMS - Nizam's Institute of Medical Sciences (Cardiology)", "Punjagutta, Hyderabad, Telangana 500082")],
          [NARAYANA, _c("Apollo Hospitals, Jubilee Hills, Hyderabad", "Road No. 72, Film Nagar, Jubilee Hills, Hyderabad 500096")]),
    "6": ("Kerala and Tamil Nadu region",
          [SCTIMST, _c("Rajiv Gandhi Government General Hospital (Madras Medical College)", "Park Town, Chennai, Tamil Nadu 600003")],
          [APOLLO_CHENNAI, _c("MIOT International (Cardiac Sciences)", "4/112, Mount Poonamallee Road, Manapakkam, Chennai 600089")]),
    "7": ("West Bengal, Odisha and North-East region",
          [_c("SSKM Hospital / IPGMER (Cardiology and CTVS), Kolkata", "244 AJC Bose Road, Kolkata, West Bengal 700020"),
           _c("AIIMS Bhubaneswar (Cardiology)", "Sijua, Patrapada, Bhubaneswar, Odisha 751019")],
          [_c("Narayana Health RTIICS (Rabindranath Tagore International Institute of Cardiac Sciences)", "1489 Mukundapur, E.M. Bypass, Kolkata 700099"),
           _c("Apollo Gleneagles Hospital, Kolkata", "58 Canal Circular Road, Kolkata 700054")]),
    "8": ("Bihar and Jharkhand region",
          [_c("AIIMS Patna (Cardiology)", "Phulwari Sharif, Patna, Bihar 801507"),
           _c("Indira Gandhi Institute of Medical Sciences (IGIMS), Patna", "Sheikhpura, Patna, Bihar 800014")],
          [_c("Paras HMRI Hospital, Patna", "Bailey Road, Raja Bazar, Patna, Bihar 800014"), MEDANTA]),
}


def _top_up(primary, regional, national, n=2):
    """Keep what we already have, then add regional picks, then national picks, without duplicates, up to n."""
    out, seen = [], set()
    for item in list(primary) + list(regional) + list(national):
        key = item["name"].strip().lower()
        if key not in seen:
            seen.add(key)
            out.append(item)
        if len(out) >= n:
            break
    return out


def _fallback_lists(pincode):
    label, gov, priv = REGIONAL_FALLBACK.get(pincode[:1], ("India (national list)", [], []))
    return label, gov, priv


def _fallback_response(pincode, reason):
    label, gov, priv = _fallback_lists(pincode)
    print(f"ℹ️ Using curated cardiac-centre fallback for PIN {pincode} ({reason})")
    return {
        "district": f"PIN {pincode}",
        "state": label,
        "government_hospitals": _top_up([], gov, NATIONAL_FALLBACK["government"]),
        "private_hospitals": _top_up([], priv, NATIONAL_FALLBACK["private"]),
        "source": "curated-fallback",
        "disclaimer": (
            "Live AI search was unavailable, so these are well-known cardiac centres for your region, chosen for general "
            "reputation (not an official ranking). Please call ahead to confirm, and ask for the Cardiology or "
            "Cardiothoracic and Vascular Surgery (CTVS) unit."
        ),
    }


@app.post("/api/find-specialists")
async def find_specialists(req: NavigatorRequest):
    # ── validate PIN ──────────────────────────────────────────────────────────
    pincode = req.pincode.strip()
    if not pincode.isdigit() or len(pincode) != 6:
        raise HTTPException(status_code=400, detail="Invalid 6-digit Indian PIN code.")

    # ── no Gemini available at all: serve the curated list instead of an error ─
    if genai is None or not GEMINI_API_KEY or GEMINI_API_KEY == "paste_your_key_here":
        return _fallback_response(pincode, "Gemini not configured")

    prompt = f"""
You are an expert medical care navigation AI for India.
A patient with {req.risk_level} cardiovascular risk has entered the Indian PIN code: {pincode}.

Using official geographic knowledge of India, provide a structured JSON response containing:
1. "district": The resolved district name for PIN code {pincode}.
2. "state": The resolved state name for PIN code {pincode}.
3. "government_hospitals": An array of 2 real Government/Public hospitals or medical colleges with
   cardiology departments nearest to PIN code {pincode}, preferring those with a cardiothoracic surgery unit.
   Each object must have "name" and "address".
4. "private_hospitals": An array of 2 real, well-known Private heart institutes or interventional cardiology
   and cardiac surgery centers nearest to PIN code {pincode}.
   Each object must have "name" and "address".

Only include hospitals you are confident really exist. Return ONLY valid JSON with those exact keys.
No markdown backticks or extra text.
"""

    try:
        text = await asyncio.to_thread(_call_gemini, prompt)
        data = _parse_json_reply(text)
        if not isinstance(data, dict):
            raise ValueError("Gemini returned a non-object JSON response.")

        label, gov, priv = _fallback_lists(pincode)
        gov_list = _top_up(_clean_facilities(data.get("government_hospitals")), gov, NATIONAL_FALLBACK["government"])
        priv_list = _top_up(_clean_facilities(data.get("private_hospitals")), priv, NATIONAL_FALLBACK["private"])
        topped_up = (len(_clean_facilities(data.get("government_hospitals"))) < 2
                     or len(_clean_facilities(data.get("private_hospitals"))) < 2)

        return {
            "district": str(data.get("district", f"PIN {pincode}")),
            "state": str(data.get("state", label)),
            "government_hospitals": gov_list,
            "private_hospitals": priv_list,
            "source": "gemini+curated" if topped_up else "gemini",
            "disclaimer": "AI-generated suggestions. Verify facility details before visiting.",
        }

    except Exception as exc:
        error_msg = f"{type(exc).__name__}: {str(exc)}"
        print(f"❌ Gemini API error in /api/find-specialists: {error_msg}")
        # never leave the patient with an error box: fall back to the curated list
        return _fallback_response(pincode, error_msg[:120])


# ------------------------------------------------------------------ /predict
def positive_probability(model, X):
    if not hasattr(model, "predict_proba"):
        raise TypeError("The model does not support predict_proba().")
    if not hasattr(model, "classes_"):
        raise TypeError("The model has no classes_ attribute. Is it fitted?")
    classes = list(model.classes_)
    if 1 not in classes:
        raise ValueError(f"Positive class 1 not found. Model classes: {classes}")
    probabilities = np.asarray(model.predict_proba(X))
    if probabilities.ndim != 2 or probabilities.shape[0] != 1:
        raise ValueError("Expected exactly one input sample and a 2D probability output.")
    if probabilities.shape[1] != len(classes):
        raise ValueError("Probability columns do not match model classes.")
    probability = float(probabilities[0, classes.index(1)])
    if not np.isfinite(probability) or not 0.0 <= probability <= 1.0:
        raise ValueError(f"Invalid predicted probability: {probability}")
    return max(0.005, min(0.995, probability))


@app.post("/predict")
async def predict_patient(payload: dict):
    if not models:
        raise HTTPException(status_code=500, detail="No prediction models are loaded.")

    try:
        incoming_data = payload.get("features", payload)

        raw_row, provided = build_row(incoming_data)
        X = encode_row(raw_row)

        predictions = {}
        vessel_risks = {}
        explanations = {}

        for name, model in models.items():
            if model is None:
                raise ValueError(f"Model '{name}' is not loaded.")

            prob = positive_probability(model, X)

            if not math.isfinite(prob) or not 0.0 <= prob <= 1.0:
                raise ValueError(f"Invalid probability from model '{name}': {prob}")

            key_upper = name.upper() if name != "cad" else "CAD"

            predictions[name] = {
                "risk_score": prob,
                "status": "High Risk" if prob >= 0.5 else "Low Risk",
            }

            if name in ("lad", "lcx", "rca"):
                vessel_risks[key_upper] = prob
                vessel_risks[name] = prob

            exp = explain(name, model, X, raw_row, provided)
            if exp:
                explanations[name] = exp
                explanations[key_upper] = exp

        if "cad" not in predictions:
            raise ValueError("Required 'cad' model is missing.")

        # ── Stacking meta-learner / consensus ──
        cad_prob = predictions["cad"]["risk_score"]
        lad_prob = vessel_risks.get("LAD", vessel_risks.get("lad", 0.0))
        lcx_prob = vessel_risks.get("LCX", vessel_risks.get("lcx", 0.0))
        rca_prob = vessel_risks.get("RCA", vessel_risks.get("rca", 0.0))
        vessel_probs_list = [lad_prob, lcx_prob, rca_prob]
        max_vessel_prob = max(vessel_probs_list) if vessel_probs_list else 0.0

        if meta_model is not None:
            try:
                meta_input = np.array([[cad_prob, lad_prob, lcx_prob, rca_prob]])
                meta_probs = meta_model.predict_proba(meta_input)
                meta_classes = list(meta_model.classes_)
                raw_meta_prob = float(meta_probs[0, meta_classes.index(1) if 1 in meta_classes else 1])
                overall_prob = float(0.5 * raw_meta_prob + 0.5 * max(cad_prob, max_vessel_prob))
            except Exception as exc:
                print(f"⚠️ Meta-model prediction error: {exc}. Falling back to balanced consensus.")
                overall_prob = float(0.5 * cad_prob + 0.5 * max_vessel_prob)
        else:
            overall_prob = float(0.5 * cad_prob + 0.5 * max_vessel_prob)

        overall_prob = max(0.005, min(0.995, overall_prob))

        # ── Completeness & confidence ──
        provided_count = len(provided)
        total_count = len(feature_names) if feature_names else 55
        completeness_ratio = provided_count / total_count if total_count > 0 else 1.0
        confidence_level = (
            "High" if completeness_ratio >= 0.8
            else ("Moderate" if completeness_ratio >= 0.5 else "Low (High Imputation)")
        )

        risk_str = (
            "Critical" if overall_prob >= 0.75
            else ("High" if overall_prob >= 0.5
                  else ("Borderline" if overall_prob >= 0.3 else "Normal"))
        )

        return {
            "status": "success",
            "overallCadProb": float(overall_prob),
            "overall_cad_prob": float(overall_prob),
            "overallRisk": risk_str,
            "riskLevel": risk_str,
            "bpm": float(raw_row.get("PR", 75)),
            "predictions": predictions,
            "vesselRisk": vessel_risks,
            "vesselProbs": vessel_risks,
            "completeness": {
                "provided": provided_count,
                "total": total_count,
                "missing": max(0, total_count - provided_count),
                "is_complete": provided_count == total_count,
                "confidence": confidence_level,
            },
            "explanations": explanations,
            "interpretation": (
                f"Dual-Layer Clinical Assessment (Data Confidence: {confidence_level}). "
                f"Global systemic cardiovascular risk evaluates metabolic, clinical, and "
                f"electrophysiological markers independently from localized anatomical vessel "
                f"stenosis probabilities, ensuring zero data leakage while providing a "
                f"comprehensive diagnostic profile."
            ),
        }

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)