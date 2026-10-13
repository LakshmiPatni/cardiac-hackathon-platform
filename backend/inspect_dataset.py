import pandas as pd

df = pd.read_excel("extention of Z-Alizadeh sani dataset.xlsx")
print("shape", df.shape)
print("columns:")
print(list(df.columns))
print("--- dtypes ---")
print(df.dtypes.to_string())
print("--- sample ---")
print(df.head(3).to_string())
print("--- uniques ---")
for c in df.columns:
    n = df[c].nunique(dropna=False)
    if n <= 20 or str(c).strip().upper() in ["LAD", "LCX", "RCA", "CATH", "CAD"]:
        print(repr(c), n, list(df[c].unique()[:25]))
