# 🔬 GenAI Employee Analytics

> A **GenAI-powered employee data quality and workforce intelligence platform** — inspired by **SAP Information Steward** methodology. Combines a Python/FastAPI backend with a sleek dark-mode frontend to deliver EDA, validation, AI-generated reviews, skill gap analysis, and data quality scoring.

**Live Demo:** [Deployed on Vercel](https://employee-analytics-sigma.vercel.app/)

---

## Features

| Feature | Description |
|---|---|
| **CSV Upload** | Drag-and-drop or browse to upload an employee dataset, or auto-loads a default CSV on startup |
| **EDA Overview** | Missing value summary, duplicate IDs, YoE statistics, invalid names/addresses |
| **Data Quality Score** | Composite score across **Accuracy**, **Validity**, **Completeness**, and **Uniqueness** |
| **Phone Validation** | Robust international phone validation using the `phonenumbers` library |
| **Intern Anomaly Detection** | Flags Interns/Trainees with YoE > 1 year across all tabs |
| **Visualisations** | Education distribution, designation breakdown, top-15 skills, YoE histogram |
| **Employee Sorting** | Sort by **Default**, **Designation**, or **AI Readiness Score** |
| **Skill Radar Chart** | Appears when sorted by Designation — shows skill coverage % per role group |
| **AI Employee Reviews** | Gemini-generated narrative HR assessments per employee |
| **Skill Gap + Courses** | Rule-based engine maps designation → required skills → recommended courses |
| **Name/Address Validation** | Gemini-powered for top-5 employees, heuristic fallback for all others |

---

## SAP Transform — Project Journey

This project follows the **SAP Transform methodology**, progressing through seven structured stages:

| Stage | What was done |
|---|---|
| **Discover** | Identified the problem space: lack of structured employee data quality tooling. Mapped out key data fields (Employee ID, Name, Email, Phone, Designation, Skills, YoE, Address, Education) and outlined the analytics goals. |
| **Prepare** | Assembled the employee dataset (`employee_dataset_v2.csv`). Defined data quality dimensions (Accuracy, Validity, Completeness, Uniqueness). Set up the Python/FastAPI backend and vanilla JS + CSS frontend tech stack. |
| **Explore** | Performed Exploratory Data Analysis (EDA): missing value analysis, duplicate detection, YoE statistics, education and designation breakdowns, and skill frequency heatmaps. Identified intern anomalies and invalid field formats. |
| **Realize – Build** | Implemented the full-stack application: FastAPI endpoints for CSV ingestion, EDA, validation, and AI review generation. Built the frontend with tab navigation, employee cards, sorting, skill radar chart, and data quality dashboard. Integrated the `phonenumbers` library for robust phone validation and the Gemini API for name/address validation and HR narrative generation. |
| **Realize – Test** | Validated all endpoints with sample CSV files. Tested edge cases: negative YoE, missing fields, intern anomaly detection, international phone formats, and Gemini fallback behaviour. Verified the DQ score calculation across all four dimensions. |
| **Deploy** | Packaged the project and deployed the frontend to **Vercel**. Configured environment variables for the Gemini API key. Verified the live deployment end-to-end. |
| **Run** | Application is live and operational. Supports real-time CSV uploads, on-demand AI reviews, and continuous data quality monitoring. Ongoing enhancements tracked via feature flags and conversation history. |

---

## Project Structure

```
employee-analytics/
├── main.py                  # FastAPI backend (Python)
├── requirements.txt         # Python dependencies
├── employee_dataset_v2.csv  # Default dataset (auto-loaded on startup)
├── server.js                # Legacy Node.js server (superseded by main.py)
├── package.json             # Node.js package metadata (legacy)
└── public/
    ├── index.html           # Single-page application shell
    ├── style.css            # Dark-mode design system
    └── app.js               # Frontend logic (vanilla JS)
```

---

## Getting Started

### Prerequisites

- **Python 3.10+**
- `pip`

### 1. Install dependencies

```bash
pip install -r requirements.txt
```

### 2. Set your Gemini API key

Open `main.py` and update:

```python
GEMINI_API_KEY = "your-api-key-here"
```

Or set it as an environment variable:

```bash
export GEMINI_API_KEY="your-api-key-here"
```

### 3. Run the server

```bash
python main.py
```

The app will be available at **[http://localhost:3001](http://localhost:3001)**.

---

## Python Dependencies

| Package | Purpose |
|---|---|
| `fastapi` | Web framework |
| `uvicorn[standard]` | ASGI server |
| `python-multipart` | File upload support |
| `pandas` | EDA and data processing |
| `phonenumbers` | International phone number validation |
| `google-genai` | Gemini API client |

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/load-default` | Load and analyse `employee_dataset_v2.csv` |
| `POST` | `/api/upload` | Upload and analyse a custom CSV file |
| `POST` | `/api/employee-review` | Get AI review + skill gap for one employee |
| `POST` | `/api/validate-fields` | Validate names and addresses (Gemini + heuristic) |

### Required CSV Columns

```
Employee ID | Name | Email ID | Designation | Phone Number | Address | Education | Skills | YoE
```

---

## Data Quality Score

The DQ score is computed on upload as the average of four dimensions:

| Dimension | How it's computed |
|---|---|
| **Accuracy** | % of rows with YoE in range 0–50 (proxy for domain accuracy) |
| **Validity** | % of rows passing all format rules (email, phone, Employee ID, YoE) |
| **Completeness** | % of non-missing cells across all required columns |
| **Uniqueness** | % of rows with a unique Employee ID |

**Grade thresholds:** Excellent ≥ 90 · Good ≥ 75 · Fair ≥ 60 · Poor < 60

---

## Intern Anomaly Rule

Any employee whose **Designation** contains `intern`, `trainee`, or `apprentice` (case-insensitive) **and** has **YoE > 1** is flagged as an anomaly. This surfaces:

- In the **Overview** tab (dedicated anomaly table)
- In the **Data Quality** tab (impact on Accuracy score)
- On **Employee cards** (amber ribbon)
- Inside the **Employee modal** (alert banner)
- In the **error rows table** (as a validation message)

---

## Skill Radar Chart

When employees are sorted by **Designation**, a radar chart appears showing the **skill coverage %** for each designation group. Coverage is calculated as the fraction of employees in that group who list each of the top-10 required skills for their role.

---

## Validation Rules

| Field | Rule |
|---|---|
| Employee ID | Must match `E` followed by digits (e.g. `E123`) |
| Email ID | Must be a valid email format |
| Phone Number | Validated with `phonenumbers` library (supports international formats) |
| YoE | Must be numeric, 0–50 |
| All required fields | Must not be empty |
| Intern + YoE > 1 | Flagged as a data anomaly |

---

## Skill Gap Engine

The rule-based skill gap engine:

1. Matches the employee's **Designation** to a role in `DESIGNATION_SKILLS`
2. Compares their listed skills (normalised via `SKILL_ALIASES`) to the required set
3. Returns **missing skills** and maps each to a course from `COURSE_CATALOGUE`
4. Computes an **AI Readiness Score** (0–100) based on skill coverage, YoE, and AI-specific skill weights

---

## License

MIT
