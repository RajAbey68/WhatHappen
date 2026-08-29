#!/usr/bin/env bash
# ==============================================================================
# Standard Test Management Operating Process — Quality Gate
# ==============================================================================
set -e

echo "🚀 [1/5] Type Checking & Next.js Build Validation..."
npm run build

echo "🔍 [2/5] SQL Migration & Query Linting..."
if command -v sqlfluff &> /dev/null; then
  sqlfluff lint supabase/migrations --dialect postgres
else
  echo "ℹ️  SQLFluff not installed locally (enforced in CI/CD)"
fi

echo "🧪 [3/5] SDK Contract, PostgREST Resilience & Unit Tests..."
npm test -- --bail __tests__/api/pgrst-resilience-and-upload-lifecycle.test.ts __tests__/api/raj782-upload-url.test.ts __tests__/api/upload-and-audio-ocr-fixes.test.ts __tests__/api/process-whatsapp-inapp.test.ts __tests__/api/projects.test.ts

echo "🛡️ [4/5] Static Check: Scanning for Fragile .select(...).single() Queries..."
# Fails if .single() is used on select lookup queries instead of .maybeSingle()
FRAGILE_SINGLE=$(grep -rn "\.select(" app/ lib/ 2>/dev/null | grep "\.single()" || true)
if [ -n "$FRAGILE_SINGLE" ]; then
  echo "❌ Error: Fragile .single() detected on SELECT lookups! Use .maybeSingle() to prevent PGRST116 errors:"
  echo "$FRAGILE_SINGLE"
  exit 1
else
  echo "✅ No fragile .single() SELECT queries detected."
fi

echo "✨ [5/5] All Quality Gates Passed! Repository is verified and ready for PR / CodeRabbit review."
