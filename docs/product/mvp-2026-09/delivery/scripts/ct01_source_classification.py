#!/usr/bin/env python3
"""Generate and verify CT-01's exact-text requirement modal crosswalk."""

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[5]
AUDIT = ROOT / "docs" / "product" / "mvp-2026-09" / "audit"
DELIVERY = ROOT / "docs" / "product" / "mvp-2026-09" / "delivery"
BENCHMARK = "REQUIREMENTS_MATRIX.json"
DOMAIN_MATRICES = (
    "pricing-data-matrix.json",
    "roles-governance-matrix.json",
    "collaboration-ai-visibility-matrix.json",
    "execution-history-matrix.json",
)
OUTPUT = DELIVERY / "CT-01_SOURCE_CLASSIFICATION.json"

MODALS = (
    ("Must", re.compile(r"\bmust\b(?!\s+not\b)", re.IGNORECASE)),
    ("Must Not", re.compile(r"\bmust\s+not\b", re.IGNORECASE)),
    ("Should", re.compile(r"\bshould\b(?!\s+not\b)", re.IGNORECASE)),
    ("Should Not", re.compile(r"\bshould\s+not\b", re.IGNORECASE)),
    ("May", re.compile(r"\bmay\b", re.IGNORECASE)),
    ("Not Required", re.compile(r"\bnot\s+required\b", re.IGNORECASE)),
)
CONDITION_PATTERN = re.compile(
    r"\b(?:only\s+if|provided\s+that|as\s+applicable|as\s+appropriate|"
    r"where\s+applicable|where\s+relevant|subject\s+to|if|when|unless|where)\b",
    re.IGNORECASE,
)
PAGE_MARKER = re.compile(r"\[p\d+\]\s*", re.IGNORECASE)
WHITESPACE = re.compile(r"\s+")
AMBIGUITY_CUES = (
    ("choice_or_question_framing", re.compile(r"\bwhether\b", re.IGNORECASE)),
    ("may_include_example_scope", re.compile(r"\bmay\s+include\b", re.IGNORECASE)),
    (
        "example_language_near_modal",
        re.compile(r"\b(?:for\s+example|e\.g\.|such\s+as)\b", re.IGNORECASE),
    ),
)


def load_json(path):
    with path.open(encoding="utf-8") as source:
        return json.load(source)


def normalized_text(requirement):
    return WHITESPACE.sub(" ", PAGE_MARKER.sub("", requirement)).strip()


def excerpt(text, start, end, limit=260):
    left = text.rfind(".", 0, start)
    left = max(left, text.rfind("?", 0, start), text.rfind("!", 0, start))
    right_candidates = [
        index for index in (text.find(".", end), text.find("?", end), text.find("!", end))
        if index >= 0
    ]
    left = left + 1 if left >= 0 else max(0, start - 110)
    right = min(right_candidates) + 1 if right_candidates else min(len(text), end + 150)
    quote = text[left:right].strip()
    if len(quote) > limit:
        quote_start = max(0, start - left - limit // 3)
        quote = quote[quote_start:quote_start + limit].strip()
        if quote_start:
            quote = "…" + quote
        if left + quote_start + limit < right:
            quote += "…"
    return quote


def evidence_for(pattern, text):
    return [
        {
            "matched_text": match.group(0),
            "snippet": excerpt(text, match.start(), match.end()),
        }
        for match in pattern.finditer(text)
    ]


def modal_flags_for(requirement):
    return {
        label: bool(pattern.search(requirement))
        for label, pattern in MODALS
    }


def condition_terms_for(requirement):
    terms = []
    for match in CONDITION_PATTERN.finditer(normalized_text(requirement)):
        term = WHITESPACE.sub(" ", match.group(0).lower())
        if term not in terms:
            terms.append(term)
    return terms


def build_rows():
    benchmark = load_json(AUDIT / BENCHMARK)
    domain_rows = {}
    domain_ids = []
    for matrix_name in DOMAIN_MATRICES:
        matrix = load_json(AUDIT / matrix_name)
        domain_ids.extend(row["id"] for row in matrix)
        for row in matrix:
            domain_rows.setdefault(row["id"], []).append((matrix_name, row))

    benchmark_ids = [row["id"] for row in benchmark]
    if len(benchmark_ids) != len(set(benchmark_ids)):
        raise ValueError("Benchmark contains duplicate requirement IDs")
    if len(domain_ids) != len(benchmark_ids):
        raise ValueError(
            f"Domain row total {len(domain_ids)} does not equal benchmark total "
            f"{len(benchmark_ids)}"
        )
    if len(domain_ids) != len(set(domain_ids)):
        raise ValueError("Domain matrices contain duplicate requirement IDs")
    if set(domain_ids) != set(benchmark_ids):
        missing = sorted(set(benchmark_ids) - set(domain_ids))
        unknown = sorted(set(domain_ids) - set(benchmark_ids))
        raise ValueError(f"Domain ID mismatch; missing={missing}, unknown={unknown}")

    rows = []
    text_mismatch_count = 0
    modal_mismatch_count = 0
    for row in benchmark:
        requirement = row["requirement"]
        cleaned = normalized_text(requirement)
        flags = modal_flags_for(requirement)
        modal_evidence = {
            label: evidence_for(pattern, cleaned)
            for label, pattern in MODALS
            if flags[label]
        }
        conditional_matches = list(CONDITION_PATTERN.finditer(cleaned))
        condition_terms = []
        condition_evidence = []
        for match in conditional_matches:
            term = WHITESPACE.sub(" ", match.group(0).lower())
            if term not in condition_terms:
                condition_terms.append(term)
            item = {
                "matched_text": match.group(0),
                "snippet": excerpt(cleaned, match.start(), match.end()),
            }
            if item not in condition_evidence:
                condition_evidence.append(item)

        review_reasons = []
        if not any(flags.values()):
            review_reasons.append("no_explicit_modal_phrase")
        for reason, cue in AMBIGUITY_CUES:
            if cue.search(cleaned):
                review_reasons.append(reason)
        if re.search(r"\bwhether\b.{0,180}\b(?:should|may)\b", cleaned, re.IGNORECASE | re.DOTALL):
            if "choice_or_question_framing" not in review_reasons:
                review_reasons.append("choice_or_question_framing")
        source_matrices = domain_rows[row["id"]]
        if len(source_matrices) != 1:
            raise ValueError(
                f"{row['id']} must occur in exactly one domain matrix; "
                f"found {len(source_matrices)}"
            )
        domain_name, domain_row = source_matrices[0]
        domain_requirement = domain_row["requirement"]
        domain_flags = modal_flags_for(domain_requirement)
        differing_modal_labels = [
            label for label in flags if flags[label] != domain_flags[label]
        ]
        benchmark_conditions = condition_terms_for(requirement)
        domain_conditions = condition_terms_for(domain_requirement)
        benchmark_only_conditions = [
            term for term in benchmark_conditions if term not in domain_conditions
        ]
        domain_only_conditions = [
            term for term in domain_conditions if term not in benchmark_conditions
        ]
        exact_text_match = requirement == domain_requirement
        if not exact_text_match:
            text_mismatch_count += 1
            review_reasons.append("benchmark_domain_requirement_text_differs")
        if differing_modal_labels:
            modal_mismatch_count += 1
            review_reasons.append("benchmark_domain_modal_flags_differ")
        if benchmark_only_conditions or domain_only_conditions:
            review_reasons.append("benchmark_domain_conditional_terms_differ")
        citation = {
            "benchmark": f"../audit/{BENCHMARK}",
            "domain_matrix": f"../audit/{domain_name}",
            "pages": row.get("pages", domain_row.get("pages", [])),
            "source_requirement_sha256": hashlib.sha256(
                requirement.encode("utf-8")
            ).hexdigest(),
            "domain_requirement_sha256": hashlib.sha256(
                domain_requirement.encode("utf-8")
            ).hexdigest(),
        }
        if not any(flags.values()):
            no_modal = cleaned[:260]
            modal_evidence["No explicit modal detected"] = [
                {"matched_text": "", "snippet": no_modal}
            ]
        domain_cleaned = normalized_text(domain_requirement)
        domain_modal_evidence = {
            label: evidence_for(pattern, domain_cleaned)
            for label, pattern in MODALS
            if domain_flags[label]
        }
        if not any(domain_flags.values()):
            domain_modal_evidence["No explicit modal detected"] = [
                {"matched_text": "", "snippet": domain_cleaned[:260]}
            ]
        domain_conditional_evidence = evidence_for(
            CONDITION_PATTERN, domain_cleaned
        )
        rows.append(
            {
                "id": row["id"],
                "title": row["title"],
                "source_modal_flags": flags,
                "source_evidence": {
                    "citation": citation,
                    "modal_occurrences": modal_evidence,
                    "conditional_scope_present": bool(conditional_matches),
                    "conditional_terms": condition_terms,
                    "conditional_occurrences": condition_evidence,
                    "domain_matrix_requirement": {
                        "sha256": hashlib.sha256(
                            domain_requirement.encode("utf-8")
                        ).hexdigest(),
                        "modal_flags": domain_flags,
                        "modal_occurrences": domain_modal_evidence,
                        "conditional_terms": domain_conditions,
                        "conditional_occurrences": domain_conditional_evidence,
                    },
                    "domain_text_comparison": {
                        "exact_requirement_match": exact_text_match,
                        "modal_flags_match": not differing_modal_labels,
                        "differing_modal_labels": differing_modal_labels,
                        "benchmark_only_conditional_terms": benchmark_only_conditions,
                        "domain_only_conditional_terms": domain_only_conditions,
                    },
                },
                "semantic_review": {
                    "needs_modal_review": bool(review_reasons),
                    "reasons": review_reasons,
                    "interpretation": "Occurrence-level extraction only; this does not resolve scope or disposition.",
                },
                "audit": {
                    "priority": row.get("priority"),
                    "gap": row.get("gap", ""),
                },
            }
        )
    return benchmark, domain_ids, rows, text_mismatch_count, modal_mismatch_count


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="verify the committed JSON matches deterministic source extraction",
    )
    args = parser.parse_args()
    _, domain_ids, rows, text_mismatches, modal_mismatches = build_rows()
    payload = {
        "schema_version": 1,
        "classification_basis": (
            "Exact modal phrase occurrence in each benchmark requirement string. "
            "Flags do not decide whether an occurrence is normative in context."
        ),
        "domain_text_alignment": {
            "comparison": (
                "Each domain matrix requirement string is compared byte-for-byte "
                "with the matching benchmark requirement string. Differences and "
                "modal/conditional classification differences are retained per row."
            ),
            "text_mismatch_count": text_mismatches,
            "modal_flag_mismatch_count": modal_mismatches,
        },
        "modal_labels": [label for label, _ in MODALS],
        "requirements": rows,
    }
    serialized = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if not OUTPUT.exists():
            raise ValueError(f"Missing generated crosswalk: {OUTPUT}")
        existing = OUTPUT.read_text(encoding="utf-8")
        if existing != serialized:
            raise ValueError(
                "Crosswalk differs from deterministic source extraction; "
                "regenerate without --check"
            )
    else:
        OUTPUT.write_text(serialized, encoding="utf-8", newline="\n")

    ids = [row["id"] for row in rows]
    if len(ids) != len(set(ids)) or set(ids) != set(domain_ids):
        raise ValueError("Crosswalk IDs are not a one-to-one match with domain matrices")
    flagged = sum(row["semantic_review"]["needs_modal_review"] for row in rows)
    explicit = sum(any(row["source_modal_flags"].values()) for row in rows)
    print(
        f"{'Verified' if args.check else 'Generated'} {len(rows)} rows; "
        f"{len(set(ids))} unique IDs; {explicit} with explicit modal phrases; "
        f"{len(rows) - explicit} with no explicit modal; "
        f"{flagged} flagged for modal review; "
        f"{text_mismatches} benchmark/domain text differences; "
        f"{modal_mismatches} modal-flag differences."
    )


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"CT-01 source crosswalk: {error}", file=sys.stderr)
        raise SystemExit(1)
