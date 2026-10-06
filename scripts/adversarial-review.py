#!/usr/bin/env python3
"""
Send a document to third-party models on OpenRouter for adversarial review.

Written because the Claude Code session was permission-blocked from reading the
Keychain and making the outbound call itself. Per CLAUDE.md V7, third-party
reviews are never simulated — this script gets the real thing.

Usage:
    python3 scripts/adversarial-review.py docs/mcp-server-spec-v22.md

    # single model
    python3 scripts/adversarial-review.py docs/mcp-server-spec-v22.md --models moonshotai/kimi-k3

Raw responses (full JSON envelopes) are written to outputs/review/.
Nothing is printed that could leak the API key.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import subprocess
import sys
import urllib.error
import urllib.request

KEYCHAIN_SERVICE = "openrouter-api-key"
KEYCHAIN_FALLBACK = "openrouter"
ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"

DEFAULT_MODELS = ["moonshotai/kimi-k3", "deepseek/deepseek-v4-pro"]

PROMPT = """You are an adversarial technical and regulatory reviewer. You are NOT here to be \
encouraging. Your job is to find what is wrong with the specification below and to give a clear \
go / no-go recommendation.

CONTEXT
- The system analyses an encrypted WhatsApp corpus (11,441 messages, 15 participants,
  Aug 2025 - Sep 2026) that is evidence in a commercial payments dispute.
- Jurisdiction: England & Wales. Data subjects may also be in Sri Lanka.
- The spec is v22; versions 1-21 were rejected. It has NOT been implemented yet.
- The author is one individual, not a team, on a 16GB M1 Pro with a server on Hetzner.

WHAT I WANT
1. ATTACK THE ARCHITECTURE. Where does the tiered routing model (legal -> local Gemma 4;
   sentiment -> hosted) actually fail? Concrete failure scenarios, not generalities.
2. ATTACK THE CLASSIFIER. The deterministic pre-filter plus local model adjudication is the
   sole control preventing legally significant content reaching third-party APIs. Find the
   ways it leaks. Be specific about bypasses.
3. ATTACK THE REGULATORY ANALYSIS (Section 7). Identify anything wrong, missing, overstated,
   or that misreads UK GDPR / DPA 2018 / DUAA 2025 / CPR PD 57AD / Civil Evidence Act 1995.
   Flag any citation that is inaccurate.
4. ATTACK THE CRYPTO AND EVIDENTIAL CLAIMS (Sections 8-9). Is the integrity and
   reproducibility story actually sound for use in litigation?
5. WHAT IS MISSING ENTIRELY? Requirements, threats, obligations or operational realities the
   spec does not mention.
6. IS THIS OVER-ENGINEERED? The author spent 21 prior versions planning and wrote zero lines
   of code. Say plainly whether this spec is buildable by one person, and what to cut.

FORMAT
- Lead with a one-paragraph verdict and an explicit BUILD / BUILD WITH CHANGES / DO NOT BUILD
  recommendation.
- Then numbered findings, most severe first. Each finding: what is wrong, why it matters, and
  what to do instead.
- Cite specific requirement IDs (REQ-xx-n, P0-n, D1-D3) where relevant.
- If a criticism you would expect is actually unwarranted, say so and defend the spec there.
- Do not pad. No summary of what the document says. Criticism only.

--- SPECIFICATION BEGINS ---

{document}

--- SPECIFICATION ENDS ---
"""


def read_key() -> str:
    for service in (KEYCHAIN_SERVICE, KEYCHAIN_FALLBACK):
        try:
            key = subprocess.run(
                ["security", "find-generic-password", "-s", service, "-w"],
                capture_output=True, text=True, check=True,
            ).stdout.strip()
            if key:
                print(f"  key source: Keychain item {service!r}", file=sys.stderr)
                return key
        except subprocess.CalledProcessError:
            continue
    sys.exit(
        f"No OpenRouter key found. Add one with:\n"
        f"  security add-generic-password -a \"$USER\" -s {KEYCHAIN_SERVICE} -w 'sk-or-...'"
    )


def review(model: str, prompt: str, key: str, timeout: int) -> dict:
    payload = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 8000,
        "temperature": 0.3,
    }).encode()

    request = urllib.request.Request(
        ENDPOINT,
        data=payload,
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "X-Title": "WhatHappen adversarial spec review",
        },
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.load(response)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("document", type=pathlib.Path)
    parser.add_argument("--models", nargs="+", default=DEFAULT_MODELS)
    parser.add_argument("--out", type=pathlib.Path, default=pathlib.Path("outputs/review"))
    parser.add_argument("--timeout", type=int, default=900)
    args = parser.parse_args()

    document = args.document.read_text()
    prompt = PROMPT.format(document=document)
    args.out.mkdir(parents=True, exist_ok=True)

    print(f"Document: {args.document} ({len(document):,} chars)")
    print(f"Prompt:   {len(prompt):,} chars\n")

    key = read_key()
    failures = 0

    for model in args.models:
        slug = model.replace("/", "_")
        print(f"\n{'=' * 72}\n{model}\n{'=' * 72}")
        try:
            envelope = review(model, prompt, key, args.timeout)
        except urllib.error.HTTPError as exc:
            print(f"  HTTP {exc.code}: {exc.read().decode()[:500]}", file=sys.stderr)
            failures += 1
            continue
        except Exception as exc:  # noqa: BLE001 - report and continue to next model
            print(f"  FAILED: {type(exc).__name__}: {exc}", file=sys.stderr)
            failures += 1
            continue

        raw_path = args.out / f"{slug}.json"
        raw_path.write_text(json.dumps(envelope, indent=2))

        usage = envelope.get("usage", {})
        print(f"id:    {envelope.get('id')}")
        print(f"model: {envelope.get('model')}")
        print(f"usage: {usage}")
        print(f"raw:   {raw_path}\n")

        content = envelope.get("choices", [{}])[0].get("message", {}).get("content", "")
        text_path = args.out / f"{slug}.md"
        text_path.write_text(content)
        print(content)

    if failures:
        print(f"\n{failures} model(s) failed.", file=sys.stderr)
    return 1 if failures == len(args.models) else 0


if __name__ == "__main__":
    raise SystemExit(main())
