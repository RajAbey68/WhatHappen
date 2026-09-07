# Linear Backlog: Claims Learning Harness & Evaluator Framework

**Priority:** P2 (High Value / Strategic Evolution)  
**Component:** `whathappen-eval-harness`  
**Owner:** Rajiv / Antigravity IDE  
**Status:** Backlog  

---

### 🎯 Objective
Adapt the proven **Insurance Claims Learning & Adjudication Harness** to WhatsApp forensic sequence analysis. Leverage AKOS / GPU learning on historical message corpora to generate benchmark test cases, establishing calibrated controls ("turning the screw") across operational, regulatory, and evidentiary thresholds.

---

### 🧩 Scope & Capabilities

1. **AKOS / GPU Offline Dataset Generation:**
   - Extract raw ground-truth interaction pairs from the 11,441 historical message archive.
   - Run GPU-accelerated batch clustering to discover canonical dispute classes (e.g. unverified float spends, tap/fixture repair disputes, supplier price inflation, unauthorized staff entries).
   - Generate golden test cases with known chronological milestones and verbatim citation requirements.

2. **The "Screw-Turning" Calibrator Matrix:**
   Establish dynamic multi-tier evaluation knobs:
   - **Legal & Evidentiary Strictness:** From loose conversational triage to strict zero-inference verbatim citations.
   - **Regulatory & Compliance Gate:** Data protection standards, redaction checks, privilege boundary screening.
   - **Data Source Grounding:** Enforce that negative assertions ("X did not happen") only emerge from exhaustive deterministic queries.
   - **Ethical & Operational Drift Detection:** Track whether operational friction or staff stress escalates over time.

3. **Benchmarking & Regression Testing:**
   - Run candidate models (Gemma 3 4B / Qwen 2.5 7B) through the golden test suite.
   - Evaluate against strict scoring metrics: Verbatim Quote Accuracy (%), Chronological Inversion Rate (%), Arithmetic Precision (%).
