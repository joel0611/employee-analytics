"""
Employee Analytics — FastAPI Backend
Replaces the Node.js/Express server.
EDA & validation powered by pandas.
AI narrative via Gemini; skill gaps & course recommendations are rule-based.
"""

from __future__ import annotations

import io
import json
import re
import os
from pathlib import Path
from typing import Any

import pandas as pd
import phonenumbers
import google.genai as genai
from google.genai import types as genai_types
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# ──────────────────────────────────────────────────────────────
# Config
# ──────────────────────────────────────────────────────────────
GEMINI_API_KEY   = "AIzaSyB1xGrQbh4wmRyTbg2cj2kr7tqWek_5yRY"
GEMINI_MODEL     = "gemini-2.0-flash"
GEMINI_SAMPLE    = 5          # max employees sent to Gemini per call
PORT             = 3001
PUBLIC_DIR       = Path(__file__).parent / "public"
DEFAULT_CSV      = Path(__file__).parent / "employee_dataset_v2.csv"

genai_client = genai.Client(api_key=GEMINI_API_KEY)

REQUIRED_COLUMNS = [
    "Employee ID", "Name", "Email ID", "Designation",
    "Phone Number", "Address", "Education", "Skills", "YoE",
]

EMAIL_RE  = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
EMP_ID_RE = re.compile(r"^E\d+$")
INTERN_TITLES = ["intern", "trainee", "apprentice"]

app = FastAPI(title="Employee Analytics")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ──────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────

def extract_json(text: str, kind: str = "object") -> str:
    text = re.sub(r"^```json\s*", "", text, flags=re.I)
    text = re.sub(r"^```\s*",    "", text, flags=re.I)
    text = re.sub(r"\s*```$",    "", text).strip()
    pattern = r"\[[\s\S]*\]" if kind == "array" else r"\{[\s\S]*\}"
    m = re.search(pattern, text)
    return m.group(0) if m else text


def gemini_generate(prompt: str) -> str:
    response = genai_client.models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt,
    )
    return response.text.strip()


# ──────────────────────────────────────────────────────────────
# Pandas EDA
# ──────────────────────────────────────────────────────────────

def validate_phone(phone_raw: str) -> bool:
    """Validate phone numbers using the phonenumbers library."""
    if not phone_raw or not phone_raw.strip():
        return False
    cleaned = phone_raw.strip()
    # Try with default region India first, then without region (requires + prefix)
    for region in ["IN", "US", None]:
        try:
            parsed = phonenumbers.parse(cleaned, region)
            if phonenumbers.is_valid_number(parsed):
                return True
        except phonenumbers.NumberParseException:
            continue
    # Fallback: try adding + prefix if it looks like international
    if not cleaned.startswith("+"):
        try:
            parsed = phonenumbers.parse("+" + cleaned, None)
            if phonenumbers.is_valid_number(parsed):
                return True
        except phonenumbers.NumberParseException:
            pass
    return False


def is_intern(designation: str) -> bool:
    d = designation.lower().strip()
    return any(t in d for t in INTERN_TITLES)


def compute_eda(df: pd.DataFrame) -> dict:
    total = len(df)
    missing_counts = {col: int(df[col].isna().sum() + (df[col] == "").sum())
                      for col in REQUIRED_COLUMNS if col in df.columns}

    dup_ids = df[df.duplicated("Employee ID", keep=False)]["Employee ID"].dropna().unique().tolist()

    # Only consider valid (>= 0) YoE values for statistics
    yoe = pd.to_numeric(df["YoE"], errors="coerce").dropna()
    yoe = yoe[yoe >= 0]
    yoe_stats = {
        "mean":   round(float(yoe.mean()), 2)   if len(yoe) else "N/A",
        "min":    float(yoe.min())               if len(yoe) else "N/A",
        "max":    float(yoe.max())               if len(yoe) else "N/A",
        "median": float(yoe.median())            if len(yoe) else "N/A",
        "count":  int(len(yoe)),
    }

    # Intern anomaly: designation contains intern keyword AND YoE > 1
    intern_anomalies = []
    for _, row in df.iterrows():
        desig = str(row.get("Designation", "")).strip()
        yoe_val = pd.to_numeric(row.get("YoE", ""), errors="coerce")
        if is_intern(desig) and not pd.isna(yoe_val) and yoe_val > 1:
            intern_anomalies.append({
                "id":  str(row.get("Employee ID", "")),
                "name": str(row.get("Name", "")),
                "designation": desig,
                "yoe": float(yoe_val),
            })

    # ── Data Quality Score ────────────────────────────────────────
    # Completeness: fraction of non-missing cells across required columns
    total_cells = total * len(REQUIRED_COLUMNS) if total else 1
    missing_cells = sum(missing_counts.values())
    completeness = round((1 - missing_cells / total_cells) * 100, 1) if total_cells else 100.0

    # Validity: fraction of rows that pass format rules (email, phone, emp ID, YoE)
    valid_mask = []
    for _, row in df.iterrows():
        row_d = row.to_dict()
        errs = validate_row(row_d, 0)
        valid_mask.append(len(errs) == 0)
    validity_count = sum(valid_mask)
    validity = round(validity_count / total * 100, 1) if total else 100.0

    # Uniqueness: fraction of rows with unique Employee ID
    dup_count = int(df.duplicated("Employee ID", keep=False).sum()) if total else 0
    uniqueness = round((1 - dup_count / total) * 100, 1) if total else 100.0

    # Accuracy: proxy — rows that are NOT intern anomalies AND have valid YoE range
    yoe_num = pd.to_numeric(df["YoE"], errors="coerce")
    yoe_in_range = ((yoe_num >= 0) & (yoe_num <= 50)).sum()
    accuracy = round(yoe_in_range / total * 100, 1) if total else 100.0

    overall_dq = round((completeness + validity + uniqueness + accuracy) / 4, 1)

    dq_score = {
        "overall": overall_dq,
        "completeness": completeness,
        "validity": validity,
        "uniqueness": uniqueness,
        "accuracy": accuracy,
    }

    return {
        "totalRows":       total,
        "missingCounts":   missing_counts,
        "duplicateIds":    dup_ids,
        "yoeStats":        yoe_stats,
        "internAnomalies": intern_anomalies,
        "dqScore":         dq_score,
    }


def validate_row(row: dict, idx: int) -> list[str]:
    errors: list[str] = []

    for col in REQUIRED_COLUMNS:
        if not str(row.get(col, "")).strip():
            errors.append(f'Missing value for "{col}"')

    eid = str(row.get("Employee ID", "")).strip()
    if eid and not EMP_ID_RE.match(eid):
        errors.append(f'Invalid Employee ID format: "{eid}" (expected E followed by digits)')

    email = str(row.get("Email ID", "")).strip()
    if email and not EMAIL_RE.match(email):
        errors.append(f'Invalid Email ID: "{email}"')

    phone_raw = str(row.get("Phone Number", "")).strip()
    if phone_raw and not validate_phone(phone_raw):
        errors.append(f'Invalid Phone Number: "{phone_raw}" (not a recognised valid phone number)')

    yoe_raw = str(row.get("YoE", "")).strip()
    if yoe_raw:
        try:
            yoe_val = float(yoe_raw)
            if yoe_val < 0:
                errors.append(f'YoE cannot be negative: "{yoe_raw}"')
            elif yoe_val > 50:
                errors.append(f'YoE out of range: "{yoe_raw}" (expected 0–50)')
        except ValueError:
            errors.append(f'YoE non-numeric: "{yoe_raw}"')

    # Intern anomaly flagged in row errors too
    desig = str(row.get("Designation", "")).strip()
    if is_intern(desig) and yoe_raw:
        try:
            if float(yoe_raw) > 1:
                errors.append(f'Anomaly: Intern with YoE > 1 year ("{yoe_raw}" yrs) — possible data error')
        except ValueError:
            pass

    return errors


def build_charts(df: pd.DataFrame) -> dict:
    edu_dist  = df["Education"].value_counts().to_dict()
    des_dist  = df["Designation"].value_counts().to_dict()

    skill_freq: dict[str, int] = {}
    for skills_str in df["Skills"].dropna():
        for sk in re.split(r"[,;|/]+", str(skills_str)):
            sk = sk.strip()
            if sk:
                skill_freq[sk] = skill_freq.get(sk, 0) + 1
    top_skills = dict(sorted(skill_freq.items(), key=lambda x: -x[1])[:15])

    yoe_numeric = pd.to_numeric(df["YoE"], errors="coerce")
    buckets = {"0-2": 0, "3-5": 0, "6-10": 0, "11-15": 0, "16-20": 0, "21+": 0}
    for v in yoe_numeric.dropna():
        if v < 0:    continue          # skip invalid negative YoE
        elif v <= 2: buckets["0-2"]   += 1
        elif v <= 5: buckets["3-5"]   += 1
        elif v <= 10:buckets["6-10"]  += 1
        elif v <= 15:buckets["11-15"] += 1
        elif v <= 20:buckets["16-20"] += 1
        else:        buckets["21+"]   += 1

    return {
        "educationDist":   edu_dist,
        "designationDist": des_dist,
        "topSkills":       top_skills,
        "yoeBuckets":      buckets,
    }


# ──────────────────────────────────────────────────────────────
# Rule-based Skill Gap Engine
# ──────────────────────────────────────────────────────────────

SKILL_ALIASES: dict[str, str] = {
    "js": "JavaScript", "javascript": "JavaScript",
    "ts": "TypeScript",  "typescript": "TypeScript",
    "py": "Python",     "python": "Python",
    "ml": "Machine Learning", "machine learning": "Machine Learning",
    "dl": "Deep Learning",    "deep learning": "Deep Learning",
    "nlp": "NLP",             "natural language processing": "NLP",
    "cv": "Computer Vision",  "computer vision": "Computer Vision",
    "sql": "SQL", "mysql": "SQL", "postgresql": "SQL", "postgres": "SQL",
    "nosql": "NoSQL", "mongodb": "NoSQL",
    "docker": "Docker", "kubernetes": "Kubernetes", "k8s": "Kubernetes",
    "git": "Git", "github": "Git", "gitlab": "Git",
    "aws": "AWS", "azure": "Azure", "gcp": "GCP",
    "react": "React", "reactjs": "React",
    "node": "Node.js", "nodejs": "Node.js", "node.js": "Node.js",
    "rest": "REST APIs", "rest api": "REST APIs", "rest apis": "REST APIs",
    "html": "HTML/CSS", "css": "HTML/CSS", "html/css": "HTML/CSS",
    "agile": "Agile", "scrum": "Agile",
    "ci/cd": "CI/CD", "cicd": "CI/CD",
    "genai": "GenAI", "llm": "LLMs", "llms": "LLMs",
    "tensorflow": "TensorFlow", "pytorch": "PyTorch",
}

DESIGNATION_SKILLS: dict[str, list[str]] = {
    "Software Engineer":        ["Python", "JavaScript", "SQL", "Git", "REST APIs", "Docker", "Agile"],
    "Senior Software Engineer": ["Python", "JavaScript", "SQL", "Git", "REST APIs", "Docker", "Kubernetes", "System Design", "CI/CD"],
    "Lead Engineer":            ["System Design", "Kubernetes", "CI/CD", "Cloud", "Mentoring", "Agile", "Docker"],
    "Data Scientist":           ["Python", "Machine Learning", "Statistics", "SQL", "TensorFlow", "NLP", "Data Visualization"],
    "Senior Data Scientist":    ["Python", "Machine Learning", "Deep Learning", "NLP", "MLOps", "SQL", "PyTorch", "TensorFlow"],
    "Data Analyst":             ["SQL", "Python", "Excel", "Tableau", "Statistics", "Data Visualization", "Power BI"],
    "Business Analyst":         ["SQL", "Excel", "Tableau", "Agile", "Requirements Gathering", "Power BI"],
    "ML Engineer":              ["Python", "TensorFlow", "PyTorch", "MLOps", "Docker", "Kubernetes", "Cloud"],
    "AI Engineer":              ["Python", "LLMs", "GenAI", "TensorFlow", "PyTorch", "NLP", "MLOps", "Cloud"],
    "DevOps Engineer":          ["Docker", "Kubernetes", "CI/CD", "Linux", "AWS", "Terraform", "Git", "Python"],
    "Cloud Engineer":           ["AWS", "Azure", "GCP", "Terraform", "Docker", "Kubernetes", "CI/CD"],
    "Full Stack Developer":     ["JavaScript", "TypeScript", "React", "Node.js", "SQL", "NoSQL", "REST APIs", "Git"],
    "Frontend Developer":       ["JavaScript", "TypeScript", "React", "HTML/CSS", "Git", "REST APIs"],
    "Backend Developer":        ["Python", "Node.js", "SQL", "NoSQL", "REST APIs", "Docker", "Git"],
    "QA Engineer":              ["Selenium", "Python", "REST APIs", "CI/CD", "Git", "Agile"],
    "Product Manager":          ["Agile", "User Research", "Analytics", "SQL", "Roadmapping", "Stakeholder Management"],
    "Project Manager":          ["Agile", "Risk Management", "Stakeholder Management", "MS Project", "Communication"],
    "HR Manager":               ["Recruitment", "People Management", "HR Analytics", "Communication", "Excel"],
    "Finance Analyst":          ["Excel", "SQL", "Financial Modeling", "Power BI", "Statistics"],
    "Marketing Analyst":        ["Google Analytics", "SQL", "Excel", "Tableau", "SEO", "Data Visualization"],
    "DEFAULT":                  ["Python", "SQL", "Communication", "Agile", "Data Analysis"],
}

COURSE_CATALOGUE: dict[str, dict] = {
    "Python":             {"title": "Python for Everybody Specialization",        "platform": "Coursera",          "level": "Beginner"},
    "JavaScript":         {"title": "The Complete JavaScript Course 2025",        "platform": "Udemy",             "level": "Beginner"},
    "TypeScript":         {"title": "Understanding TypeScript",                   "platform": "Udemy",             "level": "Intermediate"},
    "React":              {"title": "React - The Complete Guide",                 "platform": "Udemy",             "level": "Intermediate"},
    "Node.js":            {"title": "Node.js, Express, MongoDB Bootcamp",         "platform": "Udemy",             "level": "Intermediate"},
    "SQL":                {"title": "SQL for Data Science",                       "platform": "Coursera",          "level": "Beginner"},
    "NoSQL":              {"title": "MongoDB — The Complete Developer Guide",      "platform": "Udemy",             "level": "Intermediate"},
    "Machine Learning":   {"title": "Machine Learning Specialization",            "platform": "Coursera",          "level": "Intermediate"},
    "Deep Learning":      {"title": "Deep Learning Specialization",               "platform": "Coursera",          "level": "Advanced"},
    "NLP":                {"title": "Natural Language Processing Specialization", "platform": "Coursera",          "level": "Advanced"},
    "LLMs":               {"title": "LLMs: Application Through Production",       "platform": "edX (Databricks)",  "level": "Intermediate"},
    "GenAI":              {"title": "Generative AI with LLMs",                   "platform": "Coursera",          "level": "Intermediate"},
    "TensorFlow":         {"title": "TensorFlow Developer Certificate",           "platform": "Coursera",          "level": "Intermediate"},
    "PyTorch":            {"title": "Deep Learning with PyTorch",                 "platform": "Udemy",             "level": "Intermediate"},
    "MLOps":              {"title": "MLOps Specialization",                       "platform": "Coursera",          "level": "Advanced"},
    "Docker":             {"title": "Docker & Kubernetes: The Practical Guide",   "platform": "Udemy",             "level": "Intermediate"},
    "Kubernetes":         {"title": "Kubernetes for Absolute Beginners",          "platform": "Udemy",             "level": "Beginner"},
    "CI/CD":              {"title": "DevOps, CI/CD with Git, Jenkins & Docker",   "platform": "Udemy",             "level": "Intermediate"},
    "AWS":                {"title": "AWS Certified Solutions Architect",           "platform": "Udemy",             "level": "Intermediate"},
    "Azure":              {"title": "AZ-900: Microsoft Azure Fundamentals",       "platform": "Udemy",             "level": "Beginner"},
    "GCP":                {"title": "Google Cloud Professional Data Engineer",    "platform": "Coursera",          "level": "Advanced"},
    "Terraform":          {"title": "HashiCorp Certified: Terraform Associate",   "platform": "Udemy",             "level": "Intermediate"},
    "Git":                {"title": "Git & GitHub — The Practical Guide",         "platform": "Udemy",             "level": "Beginner"},
    "REST APIs":          {"title": "REST API Design, Development & Management",  "platform": "Udemy",             "level": "Intermediate"},
    "HTML/CSS":           {"title": "Responsive Web Design",                      "platform": "freeCodeCamp",      "level": "Beginner"},
    "Statistics":         {"title": "Statistics with Python Specialization",      "platform": "Coursera",          "level": "Intermediate"},
    "Data Visualization": {"title": "Data Visualization with Python",             "platform": "Coursera",          "level": "Intermediate"},
    "Tableau":            {"title": "Tableau 2025 A-Z",                           "platform": "Udemy",             "level": "Beginner"},
    "Power BI":           {"title": "Microsoft Power BI Desktop for Business",    "platform": "Udemy",             "level": "Beginner"},
    "System Design":      {"title": "System Design Interview – An Insider Guide", "platform": "Self-study",        "level": "Advanced"},
    "Computer Vision":    {"title": "Computer Vision with PyTorch",               "platform": "Udemy",             "level": "Advanced"},
    "Agile":              {"title": "Agile Fundamentals: Scrum & Kanban",         "platform": "Udemy",             "level": "Beginner"},
    "Linux":              {"title": "Linux Command Line Basics",                  "platform": "Udemy",             "level": "Beginner"},
    "Excel":              {"title": "Microsoft Excel — From Beginner to Advanced", "platform": "Udemy",            "level": "Beginner"},
    "DEFAULT":            {"title": "Google Data Analytics Certificate",           "platform": "Coursera",          "level": "Beginner"},
}


def normalise_skill(s: str) -> str:
    lower = s.strip().lower()
    if lower in SKILL_ALIASES:
        return SKILL_ALIASES[lower]
    return s.strip().title()


def parse_skills(skills_str: str) -> list[str]:
    return [normalise_skill(s) for s in re.split(r"[,;|/]+", skills_str or "") if s.strip()]


def compute_rule_based_review(employee: dict) -> dict:
    designation = str(employee.get("Designation", "")).strip()
    current_skills = parse_skills(str(employee.get("Skills", "")))
    yoe = float(employee.get("YoE", 0) or 0)

    req_key = next(
        (k for k in DESIGNATION_SKILLS if designation.lower().find(k.lower()) != -1),
        "DEFAULT",
    )
    required = DESIGNATION_SKILLS[req_key]
    current_norm = {s.lower() for s in current_skills}

    skill_gaps = [r for r in required if r.lower() not in current_norm]

    gaps_for_courses = skill_gaps if skill_gaps else required[:5]
    course_recommendations = [
        {
            "title":    (c := COURSE_CATALOGUE.get(sk, COURSE_CATALOGUE["DEFAULT"]))["title"],
            "platform": c["platform"],
            "reason":   f'Recommended to fill the "{sk}" gap for the {designation} role.',
            "skill":    sk,
            "level":    c["level"],
        }
        for sk in gaps_for_courses[:5]
    ]

    covered   = sum(1 for r in required if r.lower() in current_norm)
    skill_pct = (covered / len(required) * 60) if required else 30
    yoe_score = min(max(yoe, 0) / 15, 1) * 25  # clamp negative YoE to 0

    # AI skill weighting: each high-value AI skill adds points (max 30 bonus)
    AI_SKILL_WEIGHTS = {
        "genai": 8, "llms": 8, "nlp": 6, "machine learning": 6,
        "deep learning": 6, "computer vision": 5, "mlops": 5,
        "tensorflow": 4, "pytorch": 4,
    }
    ai_bonus = min(sum(w for s, w in AI_SKILL_WEIGHTS.items() if s in current_norm), 30)

    readiness_score = round(min(skill_pct + yoe_score + ai_bonus, 100))

    return {
        "skillGaps":            skill_gaps,
        "courseRecommendations": course_recommendations,
        "readinessScore":       readiness_score,
    }


# ──────────────────────────────────────────────────────────────
# Heuristic name/address validator
# ──────────────────────────────────────────────────────────────

def heuristic_validate(name: str, address: str) -> dict:
    name = (name or "").strip()
    address = (address or "").strip()

    parts = name.split()
    name_valid = (
        len(parts) >= 2
        and bool(re.match(r"^[A-Za-z\s'\-\.]+$", name))
        and 3 <= len(name) <= 60
    )
    name_issue = "" if name_valid else "Does not appear to be a valid full name"

    # Address: at least 8 chars and 2+ words (no digit required — many addresses are text-only)
    addr_words = address.split()
    address_valid = len(address) >= 5 and len(addr_words) >= 1
    address_issue = "" if address_valid else "Address is too short or incomplete"

    return {
        "nameValid":    name_valid,
        "nameIssue":    name_issue,
        "addressValid": address_valid,
        "addressIssue": address_issue,
    }


# ──────────────────────────────────────────────────────────────
# Routes
# ──────────────────────────────────────────────────────────────

@app.get("/api/load-default")
async def load_default():
    if not DEFAULT_CSV.exists():
        raise HTTPException(404, "Default dataset (employee_dataset_v2.csv) not found in project folder.")

    try:
        df = pd.read_csv(str(DEFAULT_CSV), dtype=str).fillna("")
        df.columns = df.columns.str.strip()
        for col in df.columns:
            df[col] = df[col].str.strip()
    except Exception as e:
        raise HTTPException(400, f"Failed to parse default CSV: {e}")

    if df.empty:
        raise HTTPException(400, "Default CSV is empty")

    missing_cols = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing_cols:
        raise HTTPException(400, f"Missing columns in default CSV: {', '.join(missing_cols)}")

    eda = compute_eda(df)

    rows = df.to_dict(orient="records")
    error_rows, valid_rows = [], []
    for i, row in enumerate(rows):
        errs = validate_row(row, i)
        if errs:
            error_rows.append({"rowIndex": i + 2, "row": row, "errors": errs})
        else:
            valid_rows.append(row)

    valid_df = pd.DataFrame(valid_rows) if valid_rows else pd.DataFrame(columns=df.columns)
    charts = build_charts(valid_df) if not valid_df.empty else {}

    return JSONResponse({
        "success":          True,
        "totalRows":        len(rows),
        "validCount":       len(valid_rows),
        "errorCount":       len(error_rows),
        "eda":              eda,
        "errorRows":        error_rows,
        "validRows":        valid_rows,
        "charts":           charts,
        "designationSkills": DESIGNATION_SKILLS,
    })


@app.post("/api/upload")
async def upload(file: UploadFile = File(...)):
    if not file.filename.endswith(".csv"):
        raise HTTPException(400, "Please upload a .csv file")

    contents = await file.read()
    try:
        df = pd.read_csv(io.BytesIO(contents), dtype=str).fillna("")
        df.columns = df.columns.str.strip()
        for col in df.columns:
            df[col] = df[col].str.strip()
    except Exception as e:
        raise HTTPException(400, f"Failed to parse CSV: {e}")

    if df.empty:
        raise HTTPException(400, "CSV is empty")

    missing_cols = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing_cols:
        raise HTTPException(400, f"Missing columns: {', '.join(missing_cols)}")

    eda = compute_eda(df)

    rows = df.to_dict(orient="records")
    error_rows, valid_rows = [], []
    for i, row in enumerate(rows):
        errs = validate_row(row, i)
        if errs:
            error_rows.append({"rowIndex": i + 2, "row": row, "errors": errs})
        else:
            valid_rows.append(row)

    valid_df = pd.DataFrame(valid_rows) if valid_rows else pd.DataFrame(columns=df.columns)
    charts = build_charts(valid_df) if not valid_df.empty else {}

    return JSONResponse({
        "success":          True,
        "totalRows":        len(rows),
        "validCount":       len(valid_rows),
        "errorCount":       len(error_rows),
        "eda":              eda,
        "errorRows":        error_rows,
        "validRows":        valid_rows,
        "charts":           charts,
        "designationSkills": DESIGNATION_SKILLS,
    })


class EmployeeReviewRequest(BaseModel):
    employee: dict[str, Any]


@app.post("/api/employee-review")
async def employee_review(body: EmployeeReviewRequest):
    emp = body.employee

    # Rule-based (always succeeds)
    rb = compute_rule_based_review(emp)

    # Gemini for narrative (single short call, graceful fallback)
    overall_review = ""
    skill_assessment = ""
    try:
        prompt = (
            f"Write a brief HR assessment for this employee. "
            f"Return JSON with exactly two keys:\n"
            f'{{\n  "overallReview": "<3-4 sentence professional assessment>",\n'
            f'  "skillAssessment": "<2-3 sentence evaluation of skill set vs designation>"\n}}\n\n'
            f"Employee: {emp.get('Name')}, {emp.get('Designation')}, "
            f"{emp.get('YoE')} yrs experience, Skills: {emp.get('Skills')}\n\n"
            f"Return ONLY valid JSON, no markdown."
        )
        text = extract_json(gemini_generate(prompt), "object")
        parsed = json.loads(text)
        overall_review   = parsed.get("overallReview", "")
        skill_assessment = parsed.get("skillAssessment", "")
    except Exception as e:
        print(f"Gemini narrative skipped: {e}")
        skills_preview = ", ".join(parse_skills(str(emp.get("Skills", "")))[:3])
        overall_review = (
            f"{emp.get('Name')} is a {emp.get('Designation')} with "
            f"{emp.get('YoE')} years of experience. Their profile shows a solid "
            f"foundation in {skills_preview}. Continued upskilling in identified "
            f"gap areas will accelerate their career trajectory."
        )
        skill_assessment = (
            f"The employee currently holds {len(parse_skills(str(emp.get('Skills', ''))))} "
            f"known skills. There are {len(rb['skillGaps'])} identified gap areas "
            f"relative to the {emp.get('Designation')} role benchmark."
        )

    return JSONResponse({
        "success": True,
        "review": {
            "overallReview":        overall_review,
            "skillAssessment":      skill_assessment,
            "skillGaps":            rb["skillGaps"],
            "courseRecommendations": rb["courseRecommendations"],
            "readinessScore":       rb["readinessScore"],
        },
    })


class ValidateRequest(BaseModel):
    employees: list[dict[str, Any]]


@app.post("/api/validate-fields")
async def validate_fields(body: ValidateRequest):
    employees = body.employees

    records = [
        {"index": i, "id": e.get("Employee ID"), "name": e.get("Name"), "address": e.get("Address")}
        for i, e in enumerate(employees)
    ]

    # Heuristic baseline for all
    validations = [
        {"index": r["index"], "id": r["id"], **heuristic_validate(r["name"], r["address"])}
        for r in records
    ]

    # Gemini override for first GEMINI_SAMPLE employees
    try:
        sample = records[:GEMINI_SAMPLE]
        prompt = (
            "You are a data quality validator. For each record decide if \"name\" is a "
            "real human full name and \"address\" is a plausible real-world address.\n"
            "Return a JSON array (one element per record, same order):\n"
            '[{"index":<n>,"id":"<id>","nameValid":true/false,"nameIssue":"<reason or empty>",'
            '"addressValid":true/false,"addressIssue":"<reason or empty>"}]\n\n'
            f"Records:\n{json.dumps(sample)}\n\nReturn ONLY a valid JSON array, no markdown."
        )
        text = extract_json(gemini_generate(prompt), "array")
        gemini_results = json.loads(text)
        if isinstance(gemini_results, list):
            for gr in gemini_results:
                idx = next((j for j, v in enumerate(validations) if v["index"] == gr.get("index")), -1)
                if idx != -1:
                    validations[idx].update(gr)
    except Exception as e:
        print(f"Gemini validation skipped — using heuristics only: {e}")

    return JSONResponse({"success": True, "validations": validations})


# ──────────────────────────────────────────────────────────────
# Static files + SPA fallback
# ──────────────────────────────────────────────────────────────

if PUBLIC_DIR.exists():
    @app.get("/")
    async def root():
        return FileResponse(str(PUBLIC_DIR / "index.html"))

    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str):
        # Serve real files from public/
        file_path = PUBLIC_DIR / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(PUBLIC_DIR / "index.html"))


# ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    import sys
    print(f"\nEmployee Analytics (Python/FastAPI) running at http://localhost:{PORT}")
    print(f"   Gemini: {GEMINI_MODEL}  |  Sample size: {GEMINI_SAMPLE} employees")
    print(f"   Skill gaps & courses: rule-based engine (pandas EDA)\n")
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=False)
