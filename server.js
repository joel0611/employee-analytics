const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const cors = require('cors');
const { Readable } = require('stream');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');

const app = express();
const PORT = 3001;

// ─────────────────────────────────────────────────────────────
//   Gemini API Key
// ─────────────────────────────────────────────────────────────
const GEMINI_API_KEY = 'AIzaSyB1xGrQbh4wmRyTbg2cj2kr7tqWek_5yRY';
const GEMINI_MODEL  = 'gemini-2.0-flash';

// Max employees sent to Gemini (stay within 5 RPM free-tier)
const GEMINI_SAMPLE_SIZE = 5;
// ─────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ storage: multer.memoryStorage() });

// ──────────────────────────────────────────────────────────────
// Gemini helper  (strips fences, extracts JSON)
// ──────────────────────────────────────────────────────────────
function getGeminiModel() {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  return genAI.getGenerativeModel({ model: GEMINI_MODEL });
}

function extractJSON(text, kind = 'object') {
  text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
  const pattern = kind === 'array' ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/;
  const m = text.match(pattern);
  return m ? m[0] : text;
}

// ──────────────────────────────────────────────────────────────
//   RULE-BASED SKILL GAP ENGINE
// ──────────────────────────────────────────────────────────────

// Canonical skill aliases (normalise input)
const SKILL_ALIASES = {
  'js': 'JavaScript', 'javascript': 'JavaScript',
  'ts': 'TypeScript', 'typescript': 'TypeScript',
  'py': 'Python', 'python': 'Python',
  'ml': 'Machine Learning', 'machine learning': 'Machine Learning',
  'dl': 'Deep Learning', 'deep learning': 'Deep Learning',
  'nlp': 'NLP', 'natural language processing': 'NLP',
  'cv': 'Computer Vision', 'computer vision': 'Computer Vision',
  'sql': 'SQL', 'mysql': 'SQL', 'postgresql': 'SQL', 'postgres': 'SQL',
  'nosql': 'NoSQL', 'mongodb': 'NoSQL',
  'docker': 'Docker', 'kubernetes': 'Kubernetes', 'k8s': 'Kubernetes',
  'git': 'Git', 'github': 'Git', 'gitlab': 'Git',
  'aws': 'AWS', 'azure': 'Azure', 'gcp': 'GCP',
  'react': 'React', 'reactjs': 'React',
  'node': 'Node.js', 'nodejs': 'Node.js', 'node.js': 'Node.js',
  'rest': 'REST APIs', 'rest api': 'REST APIs', 'rest apis': 'REST APIs',
  'html': 'HTML/CSS', 'css': 'HTML/CSS', 'html/css': 'HTML/CSS',
  'agile': 'Agile', 'scrum': 'Agile',
  'ci/cd': 'CI/CD', 'cicd': 'CI/CD',
  'genai': 'GenAI', 'llm': 'LLMs', 'llms': 'LLMs',
  'tensorflow': 'TensorFlow', 'pytorch': 'PyTorch',
};

function normaliseSkill(s) {
  const lower = s.trim().toLowerCase();
  return SKILL_ALIASES[lower] || s.trim().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function parseSkills(skillStr) {
  return (skillStr || '').split(/[,;|\/]+/).map(s => normaliseSkill(s)).filter(Boolean);
}

// Required skills per designation (generalised + domain-specific)
const DESIGNATION_SKILLS = {
  'Software Engineer':         ['Python', 'JavaScript', 'SQL', 'Git', 'REST APIs', 'Docker', 'Agile'],
  'Senior Software Engineer':  ['Python', 'JavaScript', 'SQL', 'Git', 'REST APIs', 'Docker', 'Kubernetes', 'System Design', 'CI/CD'],
  'Lead Engineer':             ['System Design', 'Kubernetes', 'CI/CD', 'Cloud', 'Mentoring', 'Agile', 'Docker'],
  'Data Scientist':            ['Python', 'Machine Learning', 'Statistics', 'SQL', 'TensorFlow', 'NLP', 'Data Visualization'],
  'Senior Data Scientist':     ['Python', 'Machine Learning', 'Deep Learning', 'NLP', 'MLOps', 'SQL', 'PyTorch', 'TensorFlow'],
  'Data Analyst':              ['SQL', 'Python', 'Excel', 'Tableau', 'Statistics', 'Data Visualization', 'Power BI'],
  'Business Analyst':          ['SQL', 'Excel', 'Tableau', 'Agile', 'Requirements Gathering', 'Power BI'],
  'ML Engineer':               ['Python', 'TensorFlow', 'PyTorch', 'MLOps', 'Docker', 'Kubernetes', 'Cloud'],
  'AI Engineer':               ['Python', 'LLMs', 'GenAI', 'TensorFlow', 'PyTorch', 'NLP', 'MLOps', 'Cloud'],
  'DevOps Engineer':           ['Docker', 'Kubernetes', 'CI/CD', 'Linux', 'AWS', 'Terraform', 'Git', 'Python'],
  'Cloud Engineer':            ['AWS', 'Azure', 'GCP', 'Terraform', 'Docker', 'Kubernetes', 'CI/CD'],
  'Full Stack Developer':      ['JavaScript', 'TypeScript', 'React', 'Node.js', 'SQL', 'NoSQL', 'REST APIs', 'Git'],
  'Frontend Developer':        ['JavaScript', 'TypeScript', 'React', 'HTML/CSS', 'Git', 'REST APIs'],
  'Backend Developer':         ['Python', 'Node.js', 'SQL', 'NoSQL', 'REST APIs', 'Docker', 'Git'],
  'QA Engineer':               ['Selenium', 'Python', 'REST APIs', 'CI/CD', 'Git', 'Agile'],
  'Product Manager':           ['Agile', 'User Research', 'Analytics', 'SQL', 'Roadmapping', 'Stakeholder Management'],
  'Project Manager':           ['Agile', 'Risk Management', 'Stakeholder Management', 'MS Project', 'Communication'],
  'HR Manager':                ['Recruitment', 'People Management', 'HR Analytics', 'Communication', 'Excel'],
  'Finance Analyst':           ['Excel', 'SQL', 'Financial Modeling', 'Power BI', 'Statistics'],
  'Marketing Analyst':         ['Google Analytics', 'SQL', 'Excel', 'Tableau', 'SEO', 'Data Visualization'],
  'DEFAULT':                   ['Python', 'SQL', 'Communication', 'Agile', 'Data Analysis'],
};

// 2025-focused course catalogue keyed by skill
const COURSE_CATALOGUE = {
  'Python':             { title: 'Python for Everybody Specialization',       platform: 'Coursera',         level: 'Beginner'     },
  'JavaScript':         { title: 'The Complete JavaScript Course 2025',       platform: 'Udemy',            level: 'Beginner'     },
  'TypeScript':         { title: 'Understanding TypeScript',                  platform: 'Udemy',            level: 'Intermediate' },
  'React':              { title: 'React - The Complete Guide',                platform: 'Udemy',            level: 'Intermediate' },
  'Node.js':            { title: 'Node.js, Express, MongoDB Bootcamp',        platform: 'Udemy',            level: 'Intermediate' },
  'SQL':                { title: 'SQL for Data Science',                      platform: 'Coursera',         level: 'Beginner'     },
  'NoSQL':              { title: 'MongoDB — The Complete Developer Guide',     platform: 'Udemy',            level: 'Intermediate' },
  'Machine Learning':   { title: 'Machine Learning Specialization',           platform: 'Coursera',         level: 'Intermediate' },
  'Deep Learning':      { title: 'Deep Learning Specialization',              platform: 'Coursera',         level: 'Advanced'     },
  'NLP':                { title: 'Natural Language Processing Specialization', platform: 'Coursera',        level: 'Advanced'     },
  'LLMs':               { title: 'LLMs: Application Through Production',      platform: 'edX (DataBricks)', level: 'Intermediate' },
  'GenAI':              { title: 'Generative AI with LLMs',                   platform: 'Coursera',         level: 'Intermediate' },
  'TensorFlow':         { title: 'TensorFlow Developer Certificate',           platform: 'Coursera',         level: 'Intermediate' },
  'PyTorch':            { title: 'Deep Learning with PyTorch',                platform: 'Udemy',            level: 'Intermediate' },
  'MLOps':              { title: 'MLOps Specialization',                      platform: 'Coursera',         level: 'Advanced'     },
  'Docker':             { title: 'Docker & Kubernetes: The Practical Guide',  platform: 'Udemy',            level: 'Intermediate' },
  'Kubernetes':         { title: 'Kubernetes for Absolute Beginners',         platform: 'Udemy',            level: 'Beginner'     },
  'CI/CD':              { title: 'DevOps, CI/CD with Git, Jenkins & Docker',  platform: 'Udemy',            level: 'Intermediate' },
  'AWS':                { title: 'AWS Certified Solutions Architect',          platform: 'Udemy',            level: 'Intermediate' },
  'Azure':              { title: 'AZ-900: Microsoft Azure Fundamentals',      platform: 'Udemy',            level: 'Beginner'     },
  'GCP':                { title: 'Google Cloud Professional Data Engineer',   platform: 'Coursera',         level: 'Advanced'     },
  'Terraform':          { title: 'HashiCorp Certified: Terraform Associate',  platform: 'Udemy',            level: 'Intermediate' },
  'Git':                { title: 'Git & GitHub — The Practical Guide',        platform: 'Udemy',            level: 'Beginner'     },
  'REST APIs':          { title: 'REST API Design, Development & Management', platform: 'Udemy',            level: 'Intermediate' },
  'HTML/CSS':           { title: 'Responsive Web Design',                     platform: 'freeCodeCamp',     level: 'Beginner'     },
  'Statistics':         { title: 'Statistics with Python Specialization',     platform: 'Coursera',         level: 'Intermediate' },
  'Data Visualization': { title: 'Data Visualization with Python',            platform: 'Coursera',         level: 'Intermediate' },
  'Tableau':            { title: 'Tableau 2025 A-Z',                          platform: 'Udemy',            level: 'Beginner'     },
  'Power BI':           { title: 'Microsoft Power BI Desktop for Business',   platform: 'Udemy',            level: 'Beginner'     },
  'System Design':      { title: 'System Design Interview – An Insider Guide', platform: 'Self-study',      level: 'Advanced'     },
  'Computer Vision':    { title: 'Computer Vision with PyTorch',              platform: 'Udemy',            level: 'Advanced'     },
  'Agile':              { title: 'Agile Fundamentals: Scrum & Kanban',        platform: 'Udemy',            level: 'Beginner'     },
  'Linux':              { title: 'Linux Command Line Basics',                 platform: 'Udemy',            level: 'Beginner'     },
  'Excel':              { title: 'Microsoft Excel — Excel from Beginner to Advanced', platform: 'Udemy',   level: 'Beginner'     },
  'DEFAULT':            { title: 'Google Data Analytics Certificate',         platform: 'Coursera',         level: 'Beginner'     },
};

/**
 * Rule-based: compute skill gaps and course recommendations for one employee.
 * Returns { skillGaps: string[], courseRecommendations: [...], readinessScore: number }
 */
function computeRuleBasedReview(employee) {
  const designation = (employee['Designation'] || '').trim();
  const currentSkills = parseSkills(employee['Skills'] || '');
  const yoe = parseFloat(employee['YoE']) || 0;

  // Find the best-matching required skill set
  const requiredKey = Object.keys(DESIGNATION_SKILLS).find(
    key => designation.toLowerCase().includes(key.toLowerCase())
  ) || 'DEFAULT';
  const required = DESIGNATION_SKILLS[requiredKey];

  // Normalise current skills for comparison
  const currentNorm = currentSkills.map(s => s.toLowerCase());
  const skillGaps = required.filter(req => !currentNorm.includes(req.toLowerCase()));

  // Course recommendations — pick from gaps first, then fill with default upskills
  const gapsForCourses = skillGaps.length > 0 ? skillGaps : required.slice(0, 5);
  const courseRecommendations = gapsForCourses.slice(0, 5).map(skill => {
    const course = COURSE_CATALOGUE[skill] || COURSE_CATALOGUE['DEFAULT'];
    return {
      title: course.title,
      platform: course.platform,
      reason: `Recommended to fill the "${skill}" gap for the ${designation} role.`,
      skill,
      level: course.level,
    };
  });

  // Readiness score: base on % of required skills met + YoE factor + bonus for AI/GenAI skills
  const covered = required.filter(req => currentNorm.includes(req.toLowerCase())).length;
  const skillScore = required.length ? (covered / required.length) * 60 : 30;
  const yoeScore = Math.min(yoe / 15, 1) * 25;
  const aiBonus = currentNorm.some(s => ['genai','llms','nlp','ml','machine learning','deep learning','ai'].includes(s)) ? 15 : 0;
  const readinessScore = Math.round(Math.min(skillScore + yoeScore + aiBonus, 100));

  return { skillGaps, courseRecommendations, readinessScore };
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function parseCSVFromBuffer(buffer) {
  return new Promise((resolve, reject) => {
    const results = [];
    const readable = Readable.from(buffer.toString('utf8'));
    readable
      .pipe(csv())
      .on('data', (row) => results.push(row))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

function normalizeRow(row) {
  const out = {};
  for (const key of Object.keys(row)) {
    out[key.trim()] = (row[key] || '').trim();
  }
  return out;
}

// ──────────────────────────────────────────────
// EDA & Validation
// ──────────────────────────────────────────────

const REQUIRED_COLUMNS = ['Employee ID', 'Name', 'Email ID', 'Designation', 'Phone Number', 'Address', 'Education', 'Skills', 'YoE'];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^(\+\d{1,3}[\s-]?)?\d{10}$/;
const EMP_ID_REGEX = /^E\d+$/;

function validateRow(row, index) {
  const errors = [];

  for (const col of REQUIRED_COLUMNS) {
    if (!row[col] || row[col].trim() === '') {
      errors.push(`Missing value for "${col}"`);
    }
  }

  if (row['Employee ID'] && !EMP_ID_REGEX.test(row['Employee ID'])) {
    errors.push(`Invalid Employee ID format: "${row['Employee ID']}" (expected E followed by digits, e.g. E101)`);
  }

  if (row['Email ID'] && !EMAIL_REGEX.test(row['Email ID'])) {
    errors.push(`Invalid Email ID: "${row['Email ID']}"`);
  }

  if (row['Phone Number'] && !PHONE_REGEX.test(row['Phone Number'].replace(/[\s\-().]/g, ''))) {
    errors.push(`Invalid Phone Number: "${row['Phone Number']}"`);
  }

  const yoe = parseFloat(row['YoE']);
  if (row['YoE'] && (isNaN(yoe) || yoe > 50)) {
    errors.push(`YoE out of range or non-numeric: "${row['YoE']}" (expected a number ≤ 50)`);
  }

  return errors;
}

function computeEDA(rows) {
  const missingCounts = {};
  const uniqueIds = new Set();
  const duplicateIds = [];

  for (const col of REQUIRED_COLUMNS) missingCounts[col] = 0;

  for (const row of rows) {
    for (const col of REQUIRED_COLUMNS) {
      if (!row[col] || row[col].trim() === '') missingCounts[col]++;
    }
    const eid = row['Employee ID'];
    if (eid) {
      if (uniqueIds.has(eid)) duplicateIds.push(eid);
      else uniqueIds.add(eid);
    }
  }

  const yoeValues = rows.map(r => parseFloat(r['YoE'])).filter(v => !isNaN(v));
  const yoeMean = yoeValues.length ? (yoeValues.reduce((a, b) => a + b, 0) / yoeValues.length).toFixed(2) : 'N/A';
  const yoeMin = yoeValues.length ? Math.min(...yoeValues) : 'N/A';
  const yoeMax = yoeValues.length ? Math.max(...yoeValues) : 'N/A';
  const sorted = [...yoeValues].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const yoeMedian = sorted.length ? (sorted.length % 2 !== 0 ? sorted[mid] : ((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2)) : 'N/A';

  return {
    totalRows: rows.length,
    missingCounts,
    duplicateIds,
    yoeStats: { mean: yoeMean, min: yoeMin, max: yoeMax, median: yoeMedian, count: yoeValues.length },
  };
}

// ──────────────────────────────────────────────
// POST /api/upload  — Parse + Validate CSV
// ──────────────────────────────────────────────
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const rawRows = await parseCSVFromBuffer(req.file.buffer);
    const rows = rawRows.map(normalizeRow);

    if (rows.length === 0) return res.status(400).json({ error: 'CSV is empty' });
    const firstRow = rows[0];
    const missingCols = REQUIRED_COLUMNS.filter(c => !(c in firstRow));
    if (missingCols.length > 0) {
      return res.status(400).json({ error: `Missing columns: ${missingCols.join(', ')}` });
    }

    const eda = computeEDA(rows);

    const errorRows = [];
    const validRows = [];
    rows.forEach((row, i) => {
      const errs = validateRow(row, i);
      if (errs.length > 0) errorRows.push({ rowIndex: i + 2, row, errors: errs });
      else validRows.push(row);
    });

    // Chart data
    const educationDist = {};
    const designationDist = {};
    const skillFreq = {};
    const yoeBuckets = { '0-2': 0, '3-5': 0, '6-10': 0, '11-15': 0, '16-20': 0, '21+': 0 };

    for (const row of validRows) {
      const edu = row['Education'] || 'Unknown';
      educationDist[edu] = (educationDist[edu] || 0) + 1;

      const des = row['Designation'] || 'Unknown';
      designationDist[des] = (designationDist[des] || 0) + 1;

      const skills = row['Skills'].split(/[,;|]+/).map(s => s.trim()).filter(Boolean);
      for (const sk of skills) skillFreq[sk] = (skillFreq[sk] || 0) + 1;

      const yoe = parseFloat(row['YoE']);
      if (!isNaN(yoe)) {
        if (yoe <= 2) yoeBuckets['0-2']++;
        else if (yoe <= 5) yoeBuckets['3-5']++;
        else if (yoe <= 10) yoeBuckets['6-10']++;
        else if (yoe <= 15) yoeBuckets['11-15']++;
        else if (yoe <= 20) yoeBuckets['16-20']++;
        else yoeBuckets['21+']++;
      }
    }

    const topSkills = Object.entries(skillFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .reduce((acc, [k, v]) => { acc[k] = v; return acc; }, {});

    res.json({
      success: true,
      totalRows: rows.length,
      validCount: validRows.length,
      errorCount: errorRows.length,
      eda,
      errorRows,
      validRows,
      charts: { educationDist, designationDist, topSkills, yoeBuckets },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// POST /api/analyze  — Bulk AI Insights (sampled)
// ──────────────────────────────────────────────
app.post('/api/analyze', async (req, res) => {
  try {
    const { employees } = req.body;
    if (!employees || employees.length === 0) return res.status(400).json({ error: 'No employee data provided' });

    // Sample up to GEMINI_SAMPLE_SIZE employees to stay within free-tier RPM
    const sample = employees.slice(0, GEMINI_SAMPLE_SIZE).map(e => ({
      designation: e['Designation'],
      education: e['Education'],
      skills: e['Skills'],
      yoe: e['YoE'],
    }));

    const model = getGeminiModel();
    const prompt = `You are an HR analytics AI. Analyze this sample of ${sample.length} employees (from a dataset of ${employees.length} total) and return a JSON object with exactly these keys:
1. "skillDistributionSummary": A 3-4 sentence paragraph about the overall skill landscape.
2. "topSkillGaps": Array of 5 objects: [{"skill":"...","reason":"..."}]
3. "upskillPaths": Array of 5 objects: [{"area":"...","recommendation":"..."}]

Sample data:
${JSON.stringify(sample)}

Return ONLY valid JSON, no markdown.`;

    const result = await model.generateContent(prompt);
    let text = extractJSON(result.response.text().trim(), 'object');

    let parsed;
    try { parsed = JSON.parse(text); }
    catch { parsed = { raw: text }; }

    res.json({ success: true, insights: parsed, sampledFrom: sample.length, totalEmployees: employees.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// POST /api/employee-review
// Gemini → overallReview + skillAssessment (narrative text)
// Rule-based → skillGaps + courseRecommendations + readinessScore
// ──────────────────────────────────────────────
app.post('/api/employee-review', async (req, res) => {
  try {
    const { employee } = req.body;
    if (!employee) return res.status(400).json({ error: 'Employee data required' });

    // ── Rule-based (no API cost) ──
    const { skillGaps, courseRecommendations, readinessScore } = computeRuleBasedReview(employee);

    // ── Gemini for narrative text only (1 API call) ──
    let overallReview = '';
    let skillAssessment = '';
    try {
      const model = getGeminiModel();
      const prompt = `Write a brief HR assessment for this employee. Return JSON with exactly two keys:
{
  "overallReview": "<3-4 sentence professional assessment of strengths and growth areas>",
  "skillAssessment": "<2-3 sentence evaluation of skill set vs designation>"
}

Employee: ${employee['Name']}, ${employee['Designation']}, ${employee['YoE']} yrs experience, Skills: ${employee['Skills']}

Return ONLY valid JSON, no markdown.`;
      const result = await model.generateContent(prompt);
      const text = extractJSON(result.response.text().trim(), 'object');
      const parsed = JSON.parse(text);
      overallReview = parsed.overallReview || '';
      skillAssessment = parsed.skillAssessment || '';
    } catch (geminiErr) {
      console.warn('Gemini narrative skipped:', geminiErr.message);
      overallReview = `${employee['Name']} is a ${employee['Designation']} with ${employee['YoE']} years of experience. Their profile shows a solid foundation in ${(employee['Skills'] || '').split(',').slice(0, 3).join(', ')}. Continued upskilling in identified gap areas will accelerate their career trajectory.`;
      skillAssessment = `The employee currently holds ${parseSkills(employee['Skills']).length} known skills. There are ${skillGaps.length} identified gap areas relative to the ${employee['Designation']} role benchmark.`;
    }

    res.json({
      success: true,
      review: { overallReview, skillAssessment, skillGaps, courseRecommendations, readinessScore },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// POST /api/validate-fields
// Gemini validates ONLY the first GEMINI_SAMPLE_SIZE employees.
// Remaining employees pass through with rule-based heuristics.
// ──────────────────────────────────────────────

// Heuristic name/address check (no API needed)
function heuristicValidate(record) {
  const name = (record.name || '').trim();
  const address = (record.address || '').trim();

  // Name: must have at least 2 words, only letters/spaces/hyphens/apostrophes, 3-60 chars
  const nameParts = name.split(/\s+/).filter(Boolean);
  const nameValid = nameParts.length >= 2
    && /^[A-Za-z\s''\-\.]+$/.test(name)
    && name.length >= 3 && name.length <= 60;
  const nameIssue = nameValid ? '' : 'Does not appear to be a valid full name';

  // Address: must be ≥10 chars and contain at least one digit (street number)
  const addressValid = address.length >= 10 && /\d/.test(address);
  const addressIssue = addressValid ? '' : 'Does not appear to be a plausible address';

  return { nameValid, nameIssue, addressValid, addressIssue };
}

app.post('/api/validate-fields', async (req, res) => {
  try {
    const { employees } = req.body;
    if (!employees || employees.length === 0) return res.status(400).json({ error: 'No data provided' });

    const records = employees.map((e, i) => ({
      index: i, id: e['Employee ID'], name: e['Name'], address: e['Address'],
    }));

    // Apply heuristic to all first, then override the first GEMINI_SAMPLE_SIZE with Gemini results
    const validations = records.map(r => ({
      index: r.index, id: r.id, ...heuristicValidate(r),
    }));

    // Gemini check on sample only
    try {
      const sample = records.slice(0, GEMINI_SAMPLE_SIZE);
      const model = getGeminiModel();
      const prompt = `You are a data quality validator. For each record decide if "name" is a real human full name and "address" is a plausible real-world address.
Return a JSON array (one element per record, same order):
[{"index":<n>,"id":"<id>","nameValid":true/false,"nameIssue":"<reason or empty>","addressValid":true/false,"addressIssue":"<reason or empty>"}]

Records:
${JSON.stringify(sample)}

Return ONLY a valid JSON array, no markdown.`;

      const result = await model.generateContent(prompt);
      const text = extractJSON(result.response.text().trim(), 'array');
      const geminiResults = JSON.parse(text);

      if (Array.isArray(geminiResults)) {
        for (const gr of geminiResults) {
          const idx = validations.findIndex(v => v.index === gr.index);
          if (idx !== -1) validations[idx] = { ...validations[idx], ...gr };
        }
      }
    } catch (geminiErr) {
      console.warn('Gemini validation skipped — using heuristics only:', geminiErr.message);
    }

    res.json({ success: true, validations });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// Serve frontend
// ──────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\nEmployee Analytics Server running at http://localhost:${PORT}\n`);
  console.log(`   Gemini: ${GEMINI_MODEL} (sample size: ${GEMINI_SAMPLE_SIZE} employees)`);
  console.log(`   Skill gaps & course recommendations: rule-based engine\n`);
});
