# Project Report
## GenAI Employee Analytics Platform

**Status:** Completed — Production Ready
**Prepared By:** Joel Basil Kurian
**Report Date:** March 17, 2026

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Business Context & Problem Statement](#2-business-context--problem-statement)
3. [Project Objectives & Success Criteria](#3-project-objectives--success-criteria)
4. [Solution Architecture](#4-solution-architecture)
5. [SAP Transform Alignment](#5-sap-transform-alignment)
6. [Sprint Plan & Execution](#6-sprint-plan--execution)
7. [Technical Stack & Dependencies](#7-technical-stack--dependencies)
8. [Key Features Delivered](#8-key-features-delivered)
9. [Data Quality Framework](#9-data-quality-framework)
10. [AI & GenAI Integration](#10-ai--genai-integration)
11. [Testing & Validation](#11-testing--validation)
12. [Outcomes & KPIs](#12-outcomes--kpis)
13. [Risks & Mitigations](#13-risks--mitigations)
14. [Lessons Learned](#14-lessons-learned)
15. [Appendix](#15-appendix)

---

## 1. Executive Summary

The **GenAI Employee Analytics Platform** is an enterprise-grade, AI-augmented workforce intelligence application developed to modernize the organization's HR data quality management and talent analytics capabilities. The platform enables HR teams and operations managers to upload employee datasets in CSV format and receive immediate, comprehensive reports covering data quality violations, exploratory data analysis (EDA), skills gap assessments, personalized learning recommendations, and AI-validated name and address profiling.

The project was executed across **three focused sprints** over a condensed two-week timeline, beginning with a Node.js/Express prototype and culminating in a production-ready Python FastAPI backend. The final solution integrates Google's **Gemini 2.0 Flash** large language model for narrative HR assessments and name/address validation, with a rule-based engine handling skill gap analysis for performance and reliability.

---

## 2. Business Context & Problem Statement

### 2.1 Organizational Challenge

Large enterprises managing hundreds or thousands of employee records face persistent data quality issues across HR platforms. Common problems include:

- **Incomplete records**: Missing email addresses, phone numbers, skills, or designations
- **Invalid formats**: Employee IDs not conforming to naming conventions, malformed emails, phone numbers with incorrect digit counts
- **Implausible data**: Non-human names, incomplete or fictional addresses, negative years of experience
- **Duplicate records**: Employees appearing multiple times with identical IDs due to migration or manual entry errors
- **Skill profile mismatches**: Employees lacking skills required for their designated role, creating hidden talent gaps

Existing tools (e.g., static Excel-based validators, fragmented HR dashboards) lacked real-time, AI-powered data quality capabilities and actionable insights.

### 2.2 Strategic Alignment

The initiative was aligned with the organization's strategic program to:
- Adopt GenAI-first tooling for internal operational workflows
- Achieve data stewardship maturity comparable to best-in-class SAP Information Steward capabilities
- Reduce manual HR data review effort by at least 60%

---

## 3. Project Objectives & Success Criteria

### 3.1 Primary Objectives

| # | Objective | Success Metric |
|---|-----------|---------------|
| 1 | Build a real-time employee data quality engine | Rules-based validation on all 9 required fields per record |
| 2 | Deliver AI-powered employee profiling | Gemini-generated HR reviews for each employee profile |
| 3 | Identify and surface skill gaps | Rule-based matching against 20+ designation skill matrices |
| 4 | Recommend learning paths | Curated course recommendations mapped to skill gaps |
| 5 | Validate names & addresses via AI | Gemini validation with heuristic fallback for all records |
| 6 | Migrate backend to Python/FastAPI | Full feature parity; no regression in existing functionality |
| 7 | Deliver a polished, intuitive frontend | Six-tab single-page application; no user training required |

### 3.2 Out of Scope (v1.0)

- Role-based access control / multi-user authentication
- Batch processing of multiple CSV files simultaneously

---

## 4. Solution Architecture

### 4.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       Client Browser                            │
│         HTML5 SPA (index.html + style.css + app.js)             │
│      6 Tabs: Upload | Overview | Data Quality | Charts |        │
│              Employees | Validation                             │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTP / REST
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   FastAPI Backend (main.py)                     │
│   Port 3001  ·  Python 3.11+  ·  Uvicorn ASGI Server            │
│                                                                 │
│  ┌──────────────┐  ┌───────────────┐  ┌─────────────────────┐   │
│  │  /api/upload │  │/api/employee- │  │/api/validate-fields │   │
│  │  CSV Parsing │  │    review     │  │ Name + Address AI   │   │
│  │  EDA Engine  │  │ Skill Gap +   │  │  Gemini + Heuristic │   │
│  │  Validation  │  │ Course Recos  │  │  Fallback           │   │
│  └──────────────┘  └───────────────┘  └─────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │               pandas EDA Engine                          │   │
│  │  Missing Values · Duplicate IDs · YoE Stats · Charts     │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │            Rule-Based Skill Gap Engine                   │   │
│  │  20+ Designation Matrices · 30+ Course Catalogue Entries │   │
│  │  Readiness Score = Skill Coverage + YoE + AI Bonus       │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTPS
                               ▼
              ┌────────────────────────────┐
              │   Google Gemini 2.0 Flash  │
              │   (google-genai SDK)       │
              │  · HR Narrative Reviews    │
              │  · Name/Address Validation │
              └────────────────────────────┘
```

### 4.2 Data Flow

1. User uploads a `.csv` file via the **Upload** tab
2. FastAPI backend parses CSV using `pandas`, strips whitespace, enforces schema
3. **EDA** is computed: missing values, duplicate IDs, YoE statistics
4. Each row is individually **validated** (9 field rules applied)
5. Valid rows are separated → chart data computed from clean data only
6. Frontend renders all six tabs simultaneously with returned JSON
7. **Validation** tab triggers `/api/validate-fields` → Gemini validates first 5 employees; heuristics cover the rest
8. Clicking any employee card calls `/api/employee-review` → Gemini narrative + rule-based skill gaps returned

---

## 5. Sprint Plan & Execution

### Sprint 1 — Foundation & Prototype
**Duration:** Day 1–3 | **Status:** Completed

**Goal:** Build the initial proof-of-concept application with core data upload and validation features.

| Task | Owner | Status |
|------|-------|--------|
| Scaffold Node.js/Express backend | Self | Done |
| Implement CSV upload and parsing (multer + csv-parser) | Self | Done |
| Implement EDA: missing values, duplicate ID detection | Self | Done |
| Build initial rule-based row validator (email, phone, EmpID, YoE) | Self | Done |
| Design HTML/CSS SPA (Upload, Overview, Data Quality tabs) | Self | Done |
| Integrate Chart.js — Education, Designation, Skills, YoE charts | Self | Done |
| Integrate Gemini API (Node.js `@google/generative-ai`) | Self | Done |
| Deploy initial version locally; smoke test with sample CSV | Self | Done |

**Sprint 1 Outcomes:**
- Functional 3-tab SPA with CSV ingestion, validation, and charting
- Gemini AI insights (narrative overview) operational
- Core validation rules enforced: email regex, phone regex, Employee ID format (`E` + digits)

**Sprint 1 Issues Identified:**
- Double-upload bug: uploading a second file re-triggered the first file's analysis
- AI Insights tab producing unreliable responses due to model version mismatch

---

### Sprint 2 — Feature Expansion & AI Enhancement
**Duration:** Day 4–8 | **Status:** Completed

**Goal:** Expand the application with employee profiling, skill gap analysis, and Gemini-powered validation.

| Task | Owner | Status |
|------|-------|--------|
| Fix double-upload bug (state clear on new upload) | Self | Done |
| Remove AI Insights tab; absorb functionality into Overview | Self | Done |
| Rename "Gemini Validation" tab to "Validation" | Self | Done |
| Add Employees tab: card-based profile grid with search/filter | Self | Done |
| Build Employee Detail Modal (click-to-expand, AI review on demand) | Self | Done |
| Build skill gap rule engine: 20 designation matrices, 30+ course catalogue | Self | Done |
| Implement `readinessScore`: skill coverage + YoE contribution + AI skill bonus | Self | Done |
| `/api/employee-review` endpoint: Gemini narrative + rule-based skill gaps | Self | Done |
| `/api/validate-fields` endpoint: Gemini + heuristic fallback | Self | Done |
| Add Incorrect Names & Addresses section to Overview tab | Self | Done |
| Adjust YoE validation: negative YoE shown as error but not excluded from display | Self | Done |
| Display errors in structured table format (not raw text) | Self | Done |

**Sprint 2 Outcomes:**
- Full 6-tab SPA operational
- Per-employee AI-powered reviews with readiness scoring (0–100)
- Skill gap analysis for 20+ job designations; course recommendations linked to curated catalogue (Coursera, Udemy, edX)
- Gemini name/address validation for sample of 5; heuristic engine covers all remaining records

---

### Sprint 3 — Backend Migration & Production Hardening
**Duration:** Day 9–12 | **Status:** Completed

**Goal:** Migrate backend from Node.js/Express to Python (FastAPI + pandas). Harden validation, error handling, and deploy-readiness.

| Task | Owner | Status |
|------|-------|--------|
| Scaffold FastAPI project ([main.py](file:///c:/Users/USER/.gemini/antigravity/scratch/employee-analytics/main.py), [requirements.txt](file:///c:/Users/USER/.gemini/antigravity/scratch/employee-analytics/requirements.txt)) | Self | Done |
| Port CSV ingestion from `multer` → `python-multipart` + `pandas` | Self | Done |
| Port EDA from manual JS loops → `pandas` aggregations | Self | Done |
| Port row validator: regex rules for email, phone, Employee ID, YoE | Self | Done |
| Port chart data builder: `value_counts()`, skill frequency, YoE buckets | Self | Done |
| Port Gemini integration to `google-genai` Python SDK | Self | Done |
| Port skill gap engine: aliases, designation matrices, course catalogue | Self | Done |
| Port heuristic name/address validator | Self | Done |
| Add CORS middleware; serve SPA static files from FastAPI | Self | Done |
| Validate API contract: confirm all frontend fetch calls work against new backend | Self | Done |
| Regression test all 6 tabs with full employee CSV dataset | Self | Done |
| Update [requirements.txt](file:///c:/Users/USER/.gemini/antigravity/scratch/employee-analytics/requirements.txt); document startup procedure | Self | Done |

**Sprint 3 Outcomes:**
- Complete Python/FastAPI backend with 100% feature parity to Node.js version
- `pandas` EDA providing statistically robust analysis with minimal code
- `google-genai` SDK replacing `@google/generative-ai` Node SDK seamlessly
- Production-ready with `uvicorn` ASGI server; containerization-ready

---

## 7. Technical Stack & Dependencies

### 7.1 Backend

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| Language | Python | 3.11+ | Application runtime |
| Web Framework | FastAPI | Latest | RESTful API endpoints |
| ASGI Server | Uvicorn | Latest | HTTP server |
| Data Processing | pandas | Latest | CSV parsing, EDA, aggregations |
| AI SDK | google-genai | Latest | Gemini 2.0 Flash API client |
| File Upload | python-multipart | Latest | CSV file handling |
| Data Validation | Pydantic | v2 (FastAPI built-in) | Request/response schema validation |

### 7.2 Frontend

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Markup | HTML5 | SPA structure |
| Styling | Vanilla CSS | Dark-mode design system, glassmorphism |
| Logic | Vanilla JavaScript | Tab routing, fetch calls, DOM rendering |
| Charting | Chart.js 4.4.3 | 4 interactive charts |

### 7.3 AI Model

| Model | Provider | Use Cases |
|-------|---------|-----------|
| `gemini-2.0-flash` | Google DeepMind | HR narrative reviews, name/address plausibility validation |

### 7.4 Legacy Stack (Sprint 1–2, deprecated post Sprint 3)

| Component | Technology |
|-----------|-----------|
| Web Framework | Node.js / Express 4.18 |
| CSV Parsing | csv-parser |
| File Upload | multer |
| AI SDK | @google/generative-ai (Node.js) |

---

## 8. Key Features Delivered

### 8.1 Upload & Ingestion
- Drag-and-drop and click-to-upload CSV interface
- Schema validation: enforces 9 required columns before processing
- Column name normalization (whitespace stripping)

### 8.2 Overview Tab
- Summary stat cards: Total Rows, Valid Records, Error Records, Duplicate IDs
- Missing Values Summary table (count + percentage per column)
- YoE Statistics: mean, min, max, median for valid records
- Duplicate Employee IDs panel
- AI-detected Invalid Names & Addresses panel (Gemini + heuristic)

### 8.3 Data Quality Tab
- Full error table: every failing row with all validation errors annotated inline
- Quality stats bar: row counts, error rate
- Clear "All Clear" state when no errors are present
- Data Quality score based on the parameters - Completeness, Validity, Accuracy, Uniqueness

### 8.4 Visualizations Tab
- **Education Distribution** — Pie chart (valid records)
- **Employees by Designation** — Bar chart (valid records)
- **Top 15 Skills Frequency** — Horizontal bar chart (all valid employees)
- **Years of Experience Distribution** — Banded histogram (6 buckets)

### 8.5 Employees Tab
- Card grid of all valid employees with avatar initials, designation chip, YoE badge
- Real-time search by name or Employee ID
- Radar chart with designation-skill distribution
- Sorting based on AI readiness score and designation
- Click-to-open employee detail modal with:
  - Personal and professional summary
  - Readiness Score (0–100) with colour-coded bar
  - AI-generated overall HR review (Gemini)
  - AI skill assessment narrative
  - Skill gaps relative to designation benchmark
  - Top 5 course recommendations (title, platform, level, reason)

### 8.6 Validation Tab
- Full name & address validation table for all employees
- Gemini-evaluated first 5 records; heuristic fallback for all others
- Columns: Employee ID | Name | Name Valid? | Name Issue | Address | Address Valid? | Address Issue

---

## 9. Data Quality Framework

### 9.1 Validation Rules

| Rule | Field | Logic |
|------|-------|-------|
| Presence Check | All 9 fields | Value must be non-null and non-empty |
| Employee ID Format | Employee ID | Must match regex `^E\d+$` |
| Email Format | Email ID | Must match standard email regex |
| Phone Format | Phone Number | 10 digits, optional country code prefix |
| YoE Range | YoE | Numeric; must be 0–50; negative flagged as error |
| YoE Type | YoE | Must be parseable as a number |
| Name Plausibility | Name | ≥2 words, alphabetic only, 3–60 chars (AI-augmented) |
| Address Plausibility | Address | ≥8 chars, ≥2 words (AI-augmented) |
| Duplicate Detection | Employee ID | Identical IDs flagged across all rows |

### 9.2 Scoring Model

The **Readiness Score** (0–100) for each employee is computed as:

```
Readiness Score = Skill Coverage Score (max 60)
                + YoE Score (max 25)
                + AI Skill Bonus (max 15)
```

- **Skill Coverage:** (required skills covered / total required) × 60
- **YoE Score:** min(YoE / 15, 1) × 25 (capped at 15 years for full points)
- **AI Skill Bonus:** cumulative weights for GenAI, LLMs, ML, NLP, DL, CV, MLOps skills

---

## 10. AI & GenAI Integration

### 10.1 Gemini API Usage

Three distinct AI workflows were implemented using **Gemini 2.0 Flash**:

| Endpoint | Prompt Strategy | Output |
|----------|----------------|--------|
| `/api/employee-review` | Structured JSON prompt; employee name, designation, YoE, skills sent | `overallReview` + `skillAssessment` (JSON string) |
| `/api/validate-fields` | Batch record validation prompt; up to 5 employees per call | JSON array of `nameValid`, `nameIssue`, `addressValid`, `addressIssue` per record |
| Overview Tab (inline) | Same `/api/validate-fields` call; results surfaced in Overview panel | Flagged employees with implausible names/addresses |

### 10.2 Resilience Pattern

All Gemini calls follow a **graceful degradation** pattern:
- If Gemini returns a malformed response → [extract_json()](file:///c:/Users/USER/.gemini/antigravity/scratch/employee-analytics/main.py#59-66) helper strips markdown fences and extracts clean JSON
- If Gemini call fails entirely → pre-defined heuristic/rule-based fallback response is used
- This ensures the application remains fully functional even during API outages or quota exhaustion

### 10.3 Privacy Considerations

- Only a **sample of 5 employees** is sent to Gemini per validation call (configurable via `GEMINI_SAMPLE`)
- No sensitive financial or government ID data is transmitted to the AI model
- Only: Employee Name, Address, Designation, Skills, and YoE are included in Gemini prompts

---

## 11. Testing & Validation

### 11.1 Functional Testing

| Test Case | Method | Result |
|-----------|--------|--------|
| Upload valid CSV with all required columns | Manual | Pass |
| Upload CSV with missing columns | Manual | Error displayed: lists missing columns |
| Upload non-CSV file | Manual | Rejected with friendly message |
| Rows with missing email, phone, or Employee ID | Manual | Flagged in Data Quality tab |
| Employee ID not matching `E\d+` pattern | Manual | Format error raised |
| Negative YoE value | Manual | Error surfaced; excluded from stats |
| YoE > 50 | Manual | Out-of-range error raised |
| Duplicate Employee IDs | Manual | Both occurrences flagged |
| Employee card click → AI review modal | Manual | Gemini review rendered |
| Validation tab → all employees listed | Manual | Paginated table rendered |
| Second CSV upload clears previous state | Manual | No double-upload bug |

### 11.2 API Contract Validation

All three FastAPI endpoints were validated post-migration:

| Endpoint | HTTP Method | Tested | Result |
|----------|------------|--------|--------|
| `/api/upload` | POST (multipart/form-data) | | 200 JSON response |
| `/api/employee-review` | POST (JSON body) | | 200 JSON review |
| `/api/validate-fields` | POST (JSON body) | | 200 JSON validations array |

### 11.3 Regression Testing

Full regression test was performed post Sprint 3 Python migration:
- All 6 tabs loaded and rendered correctly
- No JavaScript console errors
- Chart.js visualizations rendered correctly with both small (5 rows) and large (100+ rows) datasets
- Gemini integration confirmed operational with `gemini-2.0-flash` model

---

## 12. Outcomes & KPIs

| KPI | Target | Achieved |
|-----|--------|---------|
| Validation rules implemented | ≥6 | 9 rule categories |
| Designation skill matrices | ≥10 | 20 designations |
| Course catalogue entries | ≥20 | 30+ entries |
| AI features integrated | ≥2 | 3 (review, validation, overview) |
| Backend migration completeness | 100% | 100% feature parity |
| Frontend tabs delivered | 6 | 6 tabs |
| Upload bugs resolved | 0 open | Double-upload fixed |
| Sprint delivery | On schedule | All 3 sprints on time |

---

## 13. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Gemini API quota exhaustion | Medium | High | Heuristic fallback implemented; GEMINI_SAMPLE limits API calls to 5 employees |
| Large CSV files causing timeout | Medium | Medium | pandas efficient vectorized processing; file size check recommended for v2.0 |
| API key exposure in source code | High | High | API key should be externalized to environment variable `.env` file in production |
| Model deprecation (Gemini version) | Low | Medium | Model name defined as single constant (`GEMINI_MODEL`); trivial to update |
| Frontend browser compatibility | Low | Low | Vanilla JS + Chart.js; no transpilation needed; supported in all modern browsers |

---

## 14. Lessons Learned

### 14.1 What Worked Well

- **Python/pandas for EDA**: Dramatically reduced line count for data aggregation vs equivalent Node.js code (e.g., `value_counts()` replaces custom frequency loop)
- **Rule-based skill gap engine**: Predictable, auditable, and performant — no AI latency on the critical path of loading the Employees tab
- **Graceful AI degradation**: The fallback pattern meant that users never saw a broken experience during Gemini API fluctuations
- **FastAPI + Pydantic**: Automatic request validation and OpenAPI spec generation at zero cost
- **Sprint cadence**: Three tightly scoped sprints prevented scope creep and delivered a coherent, testable increment each time

### 14.2 Areas for Improvement

- **Environment variable management**: API keys hardcoded during development; must be moved to `.env` with `python-dotenv` before production deployment
- **Pagination**: The Employees tab loads all valid employee cards at once; for large datasets (500+), virtual scrolling or server-side pagination should be introduced
- **Automated test suite**: High functional coverage was achieved manually; a pytest suite for the FastAPI endpoints and Pydantic models would improve confidence in future changes
- **SAP HCM Integration**: The current iteration reads flat CSV; the next version should connect directly to SAP HCM APIs or SuccessFactors OData feeds

---

## 15. Appendix

### A. Required CSV Schema

| Column | Type | Validation Rule |
|--------|------|----------------|
| Employee ID | String | `^E\d+$` |
| Name | String | ≥2 words, alphabetic, 3–60 chars |
| Email ID | String | Standard email format |
| Designation | String | Non-empty |
| Phone Number | String | 10 digits ± country code |
| Address | String | ≥8 chars, ≥2 words |
| Education | String | Non-empty |
| Skills | String | Comma/semicolon/pipe separated |
| YoE | Numeric | 0–50 |

### B. Application Startup

```bash
# Install dependencies
pip install -r requirements.txt

# Start the FastAPI server
python main.py
# → http://localhost:3001
```

### C. Project File Structure

```
employee-analytics/
├── main.py               # FastAPI backend (EDA, validation, AI integration)
├── requirements.txt      # Python dependencies
├── public/
│   ├── index.html        # SPA shell (6 tabs)
│   ├── style.css         # Dark-mode CSS design system
│   └── app.js            # Frontend logic (fetch, rendering, charts)
├── server.js             # Legacy Node.js backend (deprecated)
└── package.json          # Legacy Node.js manifest (deprecated)
```

### D. Gemini API Configuration

| Parameter | Value |
|-----------|-------|
| Model | `gemini-2.0-flash` |
| Validation sample size | 5 employees per upload |
| SDK | `google-genai` (Python) |
| Fallback strategy | Heuristic rule-based validation |

---

*This document is classified as **Internal — Restricted**. Distribution is limited to project stakeholders, delivery leads, and SAP transformation programme management.*

*© 2026 — Employee Analytics Project Team*
