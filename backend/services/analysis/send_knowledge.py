"""SEND domain knowledge: biomarker mappings, organ systems, and biological thresholds.

Pure data module — no imports required.
"""

# LBTESTCD → biomarker metadata
BIOMARKER_MAP: dict[str, dict] = {
    # Hepatic / Liver
    "ALT": {"name": "Alanine Aminotransferase", "organ": "LIVER", "system": "hepatic", "direction_of_concern": "up", "category": "enzyme"},
    "AST": {"name": "Aspartate Aminotransferase", "organ": "LIVER", "system": "hepatic", "direction_of_concern": "up", "category": "enzyme"},
    "ALP": {"name": "Alkaline Phosphatase", "organ": "LIVER", "system": "hepatic", "direction_of_concern": "up", "category": "enzyme"},
    "GGT": {"name": "Gamma-Glutamyl Transferase", "organ": "LIVER", "system": "hepatic", "direction_of_concern": "up", "category": "enzyme"},
    "TBIL": {"name": "Total Bilirubin", "organ": "LIVER", "system": "hepatic", "direction_of_concern": "up", "category": "general"},
    "ALB": {"name": "Albumin", "organ": "LIVER", "system": "hepatic", "direction_of_concern": "down", "category": "general"},
    "TP": {"name": "Total Protein", "organ": "LIVER", "system": "hepatic", "direction_of_concern": "down", "category": "general"},
    "GLOB": {"name": "Globulin", "organ": "LIVER", "system": "hepatic", "direction_of_concern": "up", "category": "general"},
    # Renal / Kidney
    "BUN": {"name": "Blood Urea Nitrogen", "organ": "KIDNEY", "system": "renal", "direction_of_concern": "up", "category": "general"},
    "CREAT": {"name": "Creatinine", "organ": "KIDNEY", "system": "renal", "direction_of_concern": "up", "category": "general"},
    "PHOS": {"name": "Phosphorus", "organ": "KIDNEY", "system": "renal", "direction_of_concern": "up", "category": "general"},
    # Hematologic
    "RBC": {"name": "Red Blood Cell Count", "organ": "BONE MARROW", "system": "hematologic", "direction_of_concern": "down", "category": "general"},
    "HGB": {"name": "Hemoglobin", "organ": "BONE MARROW", "system": "hematologic", "direction_of_concern": "down", "category": "general"},
    "HCT": {"name": "Hematocrit", "organ": "BONE MARROW", "system": "hematologic", "direction_of_concern": "down", "category": "general"},
    "WBC": {"name": "White Blood Cell Count", "organ": "BONE MARROW", "system": "hematologic", "direction_of_concern": "up", "category": "general"},
    "PLT": {"name": "Platelet Count", "organ": "BONE MARROW", "system": "hematologic", "direction_of_concern": "down", "category": "general"},
    "RETIC": {"name": "Reticulocyte Count", "organ": "BONE MARROW", "system": "hematologic", "direction_of_concern": "up", "category": "general"},
    "MCV": {"name": "Mean Corpuscular Volume", "organ": "BONE MARROW", "system": "hematologic", "direction_of_concern": "up", "category": "general"},
    "MCH": {"name": "Mean Corpuscular Hemoglobin", "organ": "BONE MARROW", "system": "hematologic", "direction_of_concern": "up", "category": "general"},
    "MCHC": {"name": "Mean Corpuscular Hemoglobin Concentration", "organ": "BONE MARROW", "system": "hematologic", "direction_of_concern": "down", "category": "general"},
    # Electrolytes / metabolic
    "GLUC": {"name": "Glucose", "organ": None, "system": "metabolic", "direction_of_concern": "up", "category": "general"},
    "CHOL": {"name": "Cholesterol", "organ": "LIVER", "system": "metabolic", "direction_of_concern": "up", "category": "general"},
    "TRIG": {"name": "Triglycerides", "organ": "LIVER", "system": "metabolic", "direction_of_concern": "up", "category": "general"},
    "NA": {"name": "Sodium", "organ": "KIDNEY", "system": "electrolyte", "direction_of_concern": "down", "category": "general"},
    "K": {"name": "Potassium", "organ": "KIDNEY", "system": "electrolyte", "direction_of_concern": "up", "category": "general"},
    "CL": {"name": "Chloride", "organ": "KIDNEY", "system": "electrolyte", "direction_of_concern": "down", "category": "general"},
    "CA": {"name": "Calcium", "organ": None, "system": "electrolyte", "direction_of_concern": "down", "category": "general"},
    # Muscle
    "CK": {"name": "Creatine Kinase", "organ": "SKELETAL MUSCLE", "system": "musculoskeletal", "direction_of_concern": "up", "category": "enzyme"},
    "LDH": {"name": "Lactate Dehydrogenase", "organ": None, "system": "general", "direction_of_concern": "up", "category": "enzyme"},
}

# Specimen/organ name → organ system
ORGAN_SYSTEM_MAP: dict[str, str] = {
    "LIVER": "hepatic",
    "KIDNEY": "renal",
    "KIDNEYS": "renal",
    "BRAIN": "neurological",
    "SPINAL CORD": "neurological",
    "SCIATIC NERVE": "neurological",
    "HEART": "cardiovascular",
    "AORTA": "cardiovascular",
    "LUNG": "respiratory",
    "LUNGS": "respiratory",
    "TRACHEA": "respiratory",
    "LARYNX": "respiratory",
    "SPLEEN": "hematologic",
    "BONE MARROW": "hematologic",
    "THYMUS": "hematologic",
    "LYMPH NODE": "hematologic",
    "LYMPH NODE, MESENTERIC": "hematologic",
    "LYMPH NODE, MANDIBULAR": "hematologic",
    "ADRENAL GLAND": "endocrine",
    "ADRENAL GLANDS": "endocrine",
    "THYROID GLAND": "endocrine",
    "PITUITARY GLAND": "endocrine",
    "PANCREAS": "endocrine",
    "STOMACH": "gastrointestinal",
    "SMALL INTESTINE": "gastrointestinal",
    "LARGE INTESTINE": "gastrointestinal",
    "COLON": "gastrointestinal",
    "DUODENUM": "gastrointestinal",
    "JEJUNUM": "gastrointestinal",
    "ILEUM": "gastrointestinal",
    "CECUM": "gastrointestinal",
    "RECTUM": "gastrointestinal",
    "ESOPHAGUS": "gastrointestinal",
    "TESTIS": "reproductive",
    "TESTES": "reproductive",
    "EPIDIDYMIS": "reproductive",
    "PROSTATE": "reproductive",
    "OVARY": "reproductive",
    "OVARIES": "reproductive",
    "UTERUS": "reproductive",
    "MAMMARY GLAND": "reproductive",
    "SKIN": "integumentary",
    "SKELETAL MUSCLE": "musculoskeletal",
    "BONE": "musculoskeletal",
    "STERNUM": "musculoskeletal",
    "FEMUR": "musculoskeletal",
    "EYE": "ocular",
    "EYES": "ocular",
    "URINARY BLADDER": "renal",
    "INJECTION SITE": "local",
}

# Biological significance thresholds
THRESHOLDS = {
    "BW_PCT_DECREASE": 10,        # Body weight: >=10% decrease is concerning
    "OM_PCT_CHANGE": 15,          # Organ weight: >=15% change is concerning
    "LB_FOLD_CHANGE_ENZYME": 2.0, # Liver enzymes: >=2x is concerning
    "LB_FOLD_CHANGE_GENERAL": 1.5,# General lab params: >=1.5x is concerning
}

# Per-domain Cohen's d thresholds: (negligible, small, medium, large)
# Values represent upper bounds for each category; above the last is "very large"
DOMAIN_EFFECT_THRESHOLDS: dict[str, dict[str, float]] = {
    "LB": {"negligible": 0.3, "small": 0.6, "medium": 1.0, "large": 1.5},
    "BW": {"negligible": 0.2, "small": 0.5, "medium": 0.8, "large": 1.2},
    "OM": {"negligible": 0.3, "small": 0.6, "medium": 1.0, "large": 1.5},
    "FW": {"negligible": 0.2, "small": 0.5, "medium": 0.8, "large": 1.2},
    # Default for MI, MA, CL (incidence domains use severity, not Cohen's d)
    "_default": {"negligible": 0.2, "small": 0.5, "medium": 0.8, "large": 1.2},
}
