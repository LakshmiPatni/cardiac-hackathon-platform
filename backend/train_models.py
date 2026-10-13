"""
Train four independent LightGBM models:
CAD, LAD, LCX, and RCA, plus a Stacking Meta-Learner for probability harmonization.

Install:
    pip install pandas numpy scikit-learn lightgbm openpyxl joblib
"""

from pathlib import Path
import json
import joblib
import numpy as np
import pandas as pd
import sklearn
import lightgbm

from lightgbm import LGBMClassifier
from sklearn.base import clone
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    roc_auc_score,
    average_precision_score,
    brier_score_loss,
    confusion_matrix,
)
from sklearn.model_selection import train_test_split, cross_val_predict
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


# -------------------- CONFIGURATION --------------------

# Auto-detect your specific Z-Alizadeh Sani dataset filename
DATA_PATH = Path("extention of Z-Alizadeh sani dataset.xlsx")
if not DATA_PATH.exists():
    possible_files = list(Path(".").glob("*.xlsx")) + list(Path(".").glob("*.csv"))
    if possible_files:
        DATA_PATH = possible_files[0]
        print(f"⚠️ Exact file not found. Auto-detected dataset: {DATA_PATH.name}")

OUTPUT_DIR = Path("trained_models")
RANDOM_STATE = 42
TEST_SIZE = 0.20

# Global CAD is stored in the 'cath' column of this dataset variant
TARGETS = {
    "cad": "cath",
    "lad": "lad",
    "lcx": "lcx",
    "rca": "rca",
}

# Exclude these and all target columns from features
EXCLUDED_FEATURES = {"cath"}

# Updated to match the actual text labels ('CAD', 'Stenotic', 'Normal') in your Excel file
POSITIVE_LABELS = {
    "1", "1.0", "yes", "true", "positive", ">=50", "cad", "stenotic"
}
NEGATIVE_LABELS = {
    "0", "0.0", "no", "false", "negative", "<50", "normal"
}


def normalize_columns(df):
    df = df.copy()
    df.columns = [
        str(col).strip().lower()
        for col in df.columns
    ]

    if df.columns.duplicated().any():
        duplicates = df.columns[df.columns.duplicated()].tolist()
        raise ValueError(
            f"Duplicate column names after normalization: {duplicates}"
        )

    return df


def parse_target(series, target_name):
    """Strictly convert known binary labels; reject unknown values."""
    result = []

    for index, value in series.items():
        if pd.isna(value):
            raise ValueError(
                f"Missing target '{target_name}' at row {index}."
            )

        label = str(value).strip().lower()

        if label in POSITIVE_LABELS:
            result.append(1)
        elif label in NEGATIVE_LABELS:
            result.append(0)
        else:
            raise ValueError(
                f"Unrecognized label {value!r} in target "
                f"'{target_name}', row {index}. "
                "Update the explicit label mapping after "
                "checking the dataset documentation."
            )

    y = pd.Series(result, index=series.index, name=target_name)

    if y.nunique() != 2:
        raise ValueError(
            f"Target '{target_name}' does not contain both classes. "
            f"Observed counts: {y.value_counts().to_dict()}"
        )

    return y.astype(int)


def prepare_features(df, target_columns):
    excluded = set(target_columns.values()) | EXCLUDED_FEATURES
    feature_cols = [
        col for col in df.columns
        if col not in excluded
    ]

    if not feature_cols:
        raise ValueError("No feature columns remain after exclusions.")

    X = df[feature_cols].copy()

    # Convert object columns to numeric only when every observed
    # value can be converted. Keep genuine categories categorical.
    for col in X.columns:
        if (
            pd.api.types.is_object_dtype(X[col])
            or pd.api.types.is_string_dtype(X[col])
        ):
            non_missing = X[col].dropna()
            converted = pd.to_numeric(non_missing, errors="coerce")

            if converted.notna().all():
                X[col] = pd.to_numeric(X[col], errors="coerce")

    # Reject columns that contain unsupported Python objects.
    for col in X.columns:
        if (
            pd.api.types.is_object_dtype(X[col])
            or pd.api.types.is_string_dtype(X[col])
        ):
            X[col] = X[col].map(
                lambda value: (
                    value.strip() if isinstance(value, str)
                    else value
                )
            )

    # Fail early on columns that contain no usable observations.
    all_missing = X.columns[X.isna().all()].tolist()
    if all_missing:
        raise ValueError(
            f"Entirely missing feature columns: {all_missing}. "
            "Inspect the source data instead of inventing values."
        )

    return X, feature_cols


def build_pipeline(X_train):
    numeric_cols = X_train.select_dtypes(
        include=["number", "bool"]
    ).columns.tolist()

    categorical_cols = [
        col for col in X_train.columns
        if col not in numeric_cols
    ]

    transformers = []

    if numeric_cols:
        numeric_pipeline = Pipeline([
            ("imputer", SimpleImputer(strategy="median")),
        ])
        transformers.append(
            ("numeric", numeric_pipeline, numeric_cols)
        )

    if categorical_cols:
        categorical_pipeline = Pipeline([
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("onehot", OneHotEncoder(handle_unknown="ignore")),
        ])
        transformers.append(
            ("categorical", categorical_pipeline, categorical_cols)
        )

    preprocessor = ColumnTransformer(
        transformers=transformers,
        remainder="drop",
    )

    classifier = LGBMClassifier(
        objective="binary",
        n_estimators=100,
        learning_rate=0.05,
        max_depth=5,
        random_state=RANDOM_STATE,
        verbosity=-1,
        n_jobs=-1,
    )

    return Pipeline([
        ("preprocessor", preprocessor),
        ("classifier", classifier),
    ])


def evaluate_model(name, model, X_test, y_test):
    probabilities = model.predict_proba(X_test)[
        :, list(model.classes_).index(1)
    ]
    predicted = (probabilities >= 0.5).astype(int)

    tn, fp, fn, tp = confusion_matrix(
        y_test, predicted, labels=[0, 1]
    ).ravel()

    sensitivity = tp / (tp + fn) if (tp + fn) else float("nan")
    specificity = tn / (tn + fp) if (tn + fp) else float("nan")

    metrics = {
        "positive_count_test": int((y_test == 1).sum()),
        "negative_count_test": int((y_test == 0).sum()),
        "roc_auc": (
            float(roc_auc_score(y_test, probabilities))
            if y_test.nunique() == 2 else None
        ),
        "average_precision": (
            float(average_precision_score(y_test, probabilities))
            if y_test.nunique() == 2 else None
        ),
        "brier_score": float(
            brier_score_loss(y_test, probabilities)
        ),
        "sensitivity_at_0_5": float(sensitivity),
        "specificity_at_0_5": float(specificity),
    }

    print(f"\n{name.upper()} evaluation:")
    print(json.dumps(metrics, indent=2))
    return metrics


def train_and_save_models():
    if not DATA_PATH.exists():
        raise FileNotFoundError(
            f"Dataset not found: {DATA_PATH.resolve()}. "
            "Set DATA_PATH to the correct file."
        )

    if DATA_PATH.suffix.lower() in (".xlsx", ".xls"):
        df = pd.read_excel(DATA_PATH)
    elif DATA_PATH.suffix.lower() == ".csv":
        df = pd.read_csv(DATA_PATH)
    else:
        raise ValueError("Dataset must be an Excel or CSV file.")

    df = normalize_columns(df)
    print(f"Loaded {DATA_PATH}: {df.shape}")

    # Exact names only: never select a target by substring.
    for name, col in TARGETS.items():
        if col not in df.columns:
            raise ValueError(
                f"Expected target column '{col}' for '{name}'. "
                f"Available columns: {df.columns.tolist()}"
            )

    target_columns = dict(TARGETS)
    targets = {
        name: parse_target(df[col], name)
        for name, col in target_columns.items()
    }

    X, feature_cols = prepare_features(df, target_columns)

    # One shared split for all four targets.
    # Stratify on CAD to preserve the overall CAD class ratio.
    indices = np.arange(len(df))

    if targets["cad"].value_counts().min() < 2:
        raise ValueError(
            "Too few examples in one CAD class to stratify a split."
        )

    train_idx, test_idx = train_test_split(
        indices,
        test_size=TEST_SIZE,
        random_state=RANDOM_STATE,
        stratify=targets["cad"].to_numpy(),
    )

    X_train = X.iloc[train_idx]
    X_test = X.iloc[test_idx]

    # Fit preprocessing only on training features.
    pipeline_template = build_pipeline(X_train)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    models = {}
    metrics = {}

    for name, y in targets.items():
        y_train = y.iloc[train_idx]
        y_test = y.iloc[test_idx]

        if y_train.nunique() != 2:
            raise ValueError(
                f"Training split for '{name}' lacks one class."
            )

        if y_test.nunique() != 2:
            raise ValueError(
                f"Test split for '{name}' lacks one class. "
                "Revise the validation design; do not report "
                "misleading metrics."
            )

        model = clone(pipeline_template)
        model.fit(X_train, y_train)

        metrics[name] = evaluate_model(
            name, model, X_test, y_test
        )
        models[name] = model

        print(
            f"Saved-ready model {name}: "
            f"train={len(train_idx)}, test={len(test_idx)}"
        )

    # ==========================================================
    # STACKING META-LEARNER TRAINING (Pure Machine Learning Consensus)
    # ==========================================================
    print("\nTraining Stacking Meta-Learner for harmonized probability consensus...")
    meta_features_train_list = []
    
    for name in ["cad", "lad", "lcx", "rca"]:
        y_train_target = targets[name].iloc[train_idx]
        # Generate out-of-fold probability predictions using 5-fold cross-validation
        oof_probs = cross_val_predict(
            clone(pipeline_template),
            X_train,
            y_train_target,
            cv=5,
            method="predict_proba",
            n_jobs=-1
        )[:, 1] # Positive class probability index
        meta_features_train_list.append(oof_probs)

    meta_features_train = np.column_stack(meta_features_train_list)
    
    # Train Logistic Regression meta-model to learn how base model predictions combine
    meta_model = LogisticRegression(random_state=RANDOM_STATE)
    meta_model.fit(meta_features_train, targets["cad"].iloc[train_idx])
    print("Stacking Meta-Learner trained and calibrated successfully.")

    # Save one coherent artifact containing base models AND meta-model
    bundle = {
        "models": models,
        "meta_model": meta_model,  # Stacking meta-learner added here
        "feature_names": feature_cols,
        "target_columns": target_columns,
        "positive_class": 1,
        "random_state": RANDOM_STATE,
        "test_size": TEST_SIZE,
        "metrics": metrics,
        "sklearn_version": sklearn.__version__,
        "lightgbm_version": lightgbm.__version__,
        "dataset_name": DATA_PATH.name,
        "n_rows": len(df),
        "n_features": len(feature_cols),
    }

    output_path = OUTPUT_DIR / "clinical_models.joblib"
    joblib.dump(bundle, output_path)

    print("\nTraining completed.")
    print(f"Saved all models and metadata to: {output_path.resolve()}")
    print("This evaluation is internal holdout validation, not "
          "independent clinical validation.")


if __name__ == "__main__":
    train_and_save_models()