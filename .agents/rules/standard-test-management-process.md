# Standard Operating Process: Test Management & Quality Gate

This rule defines the mandatory Quality Gate protocol for all Antigravity IDE coding sessions across all projects.

## Mandatory Pre-Completion Protocol
Whenever completing a feature, bugfix, or refactoring in this repository:

1. **Zero-Row Coercion Guard**:
   - Never use `.select(...).single()` for database record lookups.
   - Always use `.maybeSingle()` so that non-existent rows return `{ data: null, error: null }` rather than crashing PostgREST with `PGRST116: Cannot coerce the result to a single JSON object`.

2. **Run the Quality Gate**:
   - Before declaring any task or branch complete, you MUST execute:
     ```bash
     npm run quality-gate # or ./scripts/quality-gate.sh
     ```
   - Verify that all 5 quality tiers pass:
     - Type checking & application build.
     - SQL migration & query linting.
     - SDK contract, PostgREST resilience, and unit tests.
     - Static query scan (zero `.select(...).single()` violations).
     - Clean exit code `0`.

3. **Code Review Hand-Off**:
   - Ensure `.coderabbit.yaml` is present in the repository root for automated PR review.
   - Separate OBSERVED outputs, INFERRED conclusions, and ASSUMPTIONS in all final task reports.
