#!/usr/bin/env python3
"""Generate and verify the exhaustive CT-01 owner disposition inventory."""

import argparse
import hashlib
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[5]
BASE = ROOT / "docs" / "product" / "mvp-2026-09"
AUDIT = BASE / "audit"
DELIVERY = BASE / "delivery"
BENCHMARK_PATH = AUDIT / "REQUIREMENTS_MATRIX.json"
DOMAIN_MATRIX_NAMES = (
    "pricing-data-matrix.json",
    "roles-governance-matrix.json",
    "collaboration-ai-visibility-matrix.json",
    "execution-history-matrix.json",
)
CROSSWALK_PATH = DELIVERY / "CT-01_SOURCE_CLASSIFICATION.json"
OWNERSHIP_PATH = DELIVERY / "requirements-ownership.json"
DECISIONS_PATH = DELIVERY / "DECISIONS.md"
PRD_PATH = BASE / "source" / "prototype-prd.pdf"
OUTPUT_PATH = DELIVERY / "CT-01_REQUIREMENT_DISPOSITIONS.json"
EXPECTED_REQUIREMENTS = 379
STATUS_FIELDS = {
    "frontendStatus": {
        "absent",
        "conflicting",
        "sample-complete",
        "sample-partial",
        "unverified",
    },
    "backendStatus": {
        "absent",
        "conflicting",
        "implemented-source",
        "partial-source",
        "unverified",
    },
    "integrationStatus": {"not-connected"},
}
ASSESSMENT_FIELDS = (
    "priority",
    "frontendStatus",
    "backendStatus",
    "integrationStatus",
    "evidenceFrontend",
    "evidenceBackend",
    "gap",
    "misrepresentation",
    "acceptance",
)


def read_json(path):
    with path.open(encoding="utf-8") as source:
        return json.load(source)


def repo_path(path):
    return path.relative_to(ROOT).as_posix()


def sha256_bytes(content):
    return hashlib.sha256(content).hexdigest()


def file_sha256(path):
    return sha256_bytes(path.read_bytes())


def index_unique(rows, key, label):
    indexed = {}
    for row in rows:
        value = row.get(key)
        if not isinstance(value, str) or not value:
            raise ValueError(f"{label} contains a row without a valid {key}")
        if value in indexed:
            raise ValueError(f"{label} contains duplicate ID {value}")
        indexed[value] = row
    return indexed


def assessment_for(row):
    return {field: row.get(field) for field in ASSESSMENT_FIELDS}


def build_inventory():
    benchmark = read_json(BENCHMARK_PATH)
    crosswalk = read_json(CROSSWALK_PATH)
    ownership = read_json(OWNERSHIP_PATH)
    decisions = DECISIONS_PATH.read_text(encoding="utf-8")

    if "No decision in this register has been ratified" not in decisions:
        raise ValueError(
            "DECISIONS.md no longer confirms that all recorded decisions are open; "
            "review owner disposition statuses before regenerating"
        )
    benchmark_rows = index_unique(benchmark, "id", "Benchmark")
    crosswalk_rows = index_unique(
        crosswalk.get("requirements", []), "id", "Source crosswalk"
    )
    ownership_rows = index_unique(
        ownership, "requirementId", "Requirement ownership map"
    )
    domain_rows = {}
    for matrix_name in DOMAIN_MATRIX_NAMES:
        matrix = read_json(AUDIT / matrix_name)
        for requirement_id, row in index_unique(
            matrix, "id", f"Domain matrix {matrix_name}"
        ).items():
            domain_rows.setdefault(requirement_id, []).append((matrix_name, row))

    expected_ids = set(benchmark_rows)
    if len(benchmark_rows) != EXPECTED_REQUIREMENTS:
        raise ValueError(
            f"Expected {EXPECTED_REQUIREMENTS} benchmark requirements; "
            f"found {len(benchmark_rows)}"
        )
    for label, indexed in (
        ("Source crosswalk", crosswalk_rows),
        ("Requirement ownership map", ownership_rows),
        ("Domain matrices", domain_rows),
    ):
        actual_ids = set(indexed)
        if actual_ids != expected_ids:
            missing = sorted(expected_ids - actual_ids)
            unknown = sorted(actual_ids - expected_ids)
            raise ValueError(
                f"{label} ID mismatch; missing={missing}, unknown={unknown}"
            )
        if label == "Domain matrices":
            duplicate_domains = sorted(
                requirement_id
                for requirement_id, matches in indexed.items()
                if len(matches) != 1
            )
            if duplicate_domains:
                raise ValueError(
                    "Each requirement must occur in exactly one domain matrix; "
                    f"invalid={duplicate_domains}"
                )

    pdf_hash = file_sha256(PRD_PATH)
    records = []
    for requirement_id, benchmark_row in benchmark_rows.items():
        domain_name, domain_row = domain_rows[requirement_id][0]
        crosswalk_row = crosswalk_rows[requirement_id]
        ownership_row = ownership_rows[requirement_id]
        source = benchmark_row.get("source", {})
        if source.get("path") != repo_path(PRD_PATH):
            raise ValueError(f"{requirement_id} cites an unexpected source document")
        if source.get("sha256") != pdf_hash:
            raise ValueError(f"{requirement_id} source PDF hash does not match")
        pages = benchmark_row.get("pages")
        if (
            not isinstance(pages, list)
            or not pages
            or any(not isinstance(page, int) or page < 1 for page in pages)
            or source.get("physicalPages") != pages
        ):
            raise ValueError(f"{requirement_id} has invalid or conflicting page refs")
        domain_pages = domain_row.get("pages")
        if (
            not isinstance(domain_pages, list)
            or not domain_pages
            or any(not isinstance(page, int) or page < 1 for page in domain_pages)
        ):
            raise ValueError(f"{requirement_id} has invalid domain-matrix page refs")
        if crosswalk_row.get("source_evidence", {}).get("citation", {}).get(
            "pages"
        ) != pages:
            raise ValueError(f"{requirement_id} crosswalk page reference differs")
        if not isinstance(benchmark_row.get("requirement"), str) or not benchmark_row[
            "requirement"
        ]:
            raise ValueError(f"{requirement_id} has no exact source text")
        if crosswalk_row.get("source_evidence", {}).get("citation", {}).get(
            "source_requirement_sha256"
        ) != sha256_bytes(benchmark_row["requirement"].encode("utf-8")):
            raise ValueError(f"{requirement_id} crosswalk source text hash differs")
        if ownership_row.get("physicalPages") != pages:
            raise ValueError(f"{requirement_id} ownership page reference differs")
        for status_field, allowed_values in STATUS_FIELDS.items():
            if benchmark_row.get(status_field) not in allowed_values:
                raise ValueError(
                    f"{requirement_id} has invalid {status_field}: "
                    f"{benchmark_row.get(status_field)!r}"
                )

        domain_assessment = assessment_for(domain_row)
        benchmark_assessment = assessment_for(benchmark_row)
        assessment_differences = {
            field: {
                "benchmark": benchmark_assessment[field],
                "domain_matrix": domain_assessment[field],
            }
            for field in ASSESSMENT_FIELDS
            if benchmark_assessment[field] != domain_assessment[field]
        }
        source_evidence = crosswalk_row.get("source_evidence", {})
        text_comparison = source_evidence.get("domain_text_comparison", {})
        if text_comparison.get("exact_requirement_match") != (
            benchmark_row["requirement"] == domain_row.get("requirement")
        ):
            raise ValueError(
                f"{requirement_id} crosswalk requirement text comparison is stale"
            )
        if text_comparison.get("modal_flags_match") != (
            crosswalk_row.get("source_modal_flags")
            == source_evidence.get("domain_matrix_requirement", {}).get(
                "modal_flags"
            )
        ):
            raise ValueError(
                f"{requirement_id} crosswalk modal comparison is stale"
            )

        review_reasons = crosswalk_row.get("semantic_review", {}).get(
            "reasons", []
        )
        review_cues = list(review_reasons)
        if pages != domain_pages:
            review_cues.append("benchmark_domain_page_references_differ")
        if assessment_differences:
            review_cues.append(
                "benchmark_domain_assessment_differs:"
                + ",".join(sorted(assessment_differences))
            )
        notes = []
        if pages != domain_pages:
            notes.append(
                f"Benchmark/PDF pages {pages} differ from domain-matrix page refs "
                f"{domain_pages}; preserve both references for owner review."
            )
        if not text_comparison.get("exact_requirement_match"):
            notes.append(
                "Benchmark and domain-matrix requirement texts differ; "
                "preserve both and review against the cited PRD pages."
            )
        differing_modals = text_comparison.get("differing_modal_labels", [])
        if differing_modals:
            notes.append(
                "Benchmark and domain-matrix modal flags differ for "
                + ", ".join(differing_modals)
                + "; flags are occurrence evidence, not a reconciled interpretation."
            )
        if text_comparison.get("benchmark_only_conditional_terms") or text_comparison.get(
            "domain_only_conditional_terms"
        ):
            notes.append(
                "Conditional wording differs between matrices; inspect both "
                "source texts without inferring a scope."
            )
        if assessment_differences:
            notes.append(
                "Recorded benchmark/domain assessment fields differ: "
                + ", ".join(sorted(assessment_differences))
                + "; neither source is silently preferred."
            )
        if review_reasons:
            notes.append(
                "The occurrence crosswalk flags wording for human review: "
                + ", ".join(review_reasons)
                + "; it does not decide normative meaning."
            )
        if not notes:
            notes.append(
                "No automated discrepancy or wording cue was flagged; this is "
                "not a semantic ruling. Owner disposition remains open."
            )

        records.append(
            {
                "id": requirement_id,
                "title": benchmark_row["title"],
                "source": {
                    "document": source["path"],
                    "documentSha256": source["sha256"],
                    "physicalPages": pages,
                    "benchmarkMatrix": repo_path(BENCHMARK_PATH),
                    "benchmarkRequirementSha256": sha256_bytes(
                        benchmark_row["requirement"].encode("utf-8")
                    ),
                    "exactNormativeText": benchmark_row["requirement"],
                },
                "sourceModalEvidence": {
                    "crosswalk": repo_path(CROSSWALK_PATH),
                    "row": crosswalk_row,
                },
                "benchmarkAssessment": {
                    **benchmark_assessment,
                    "evidenceLinksFrontend": benchmark_row.get(
                        "evidenceLinksFrontend", []
                    ),
                    "evidenceLinksBackend": benchmark_row.get(
                        "evidenceLinksBackend", []
                    ),
                    "acceptanceStatus": benchmark_row.get("acceptanceStatus"),
                    "verificationBasis": benchmark_row.get("verificationBasis"),
                    "reference": repo_path(BENCHMARK_PATH),
                },
                "domainMatrixEvidence": {
                    "reference": repo_path(AUDIT / domain_name),
                    "physicalPages": domain_pages,
                    "exactRequirementText": domain_row.get("requirement", ""),
                    "requirementSha256": sha256_bytes(
                        domain_row.get("requirement", "").encode("utf-8")
                    ),
                    "assessment": domain_assessment,
                    "differencesFromBenchmark": assessment_differences,
                },
                "evidenceFacets": {
                    **ownership_row,
                    "reference": repo_path(OWNERSHIP_PATH),
                },
                "ownerDisposition": {
                    "status": "open",
                    "disposition": None,
                    "decider": None,
                    "ratificationDate": None,
                    "authoritativeReference": None,
                    "rationale": None,
                    "compatibilityImpact": None,
                },
                "review": {
                    "status": (
                        "owner-review-required"
                        if review_cues
                        else "no-automated-review-cue"
                    ),
                    "cues": review_cues,
                    "note": " ".join(notes),
                },
            }
        )

    inputs = [
        BENCHMARK_PATH,
        *(AUDIT / name for name in DOMAIN_MATRIX_NAMES),
        CROSSWALK_PATH,
        OWNERSHIP_PATH,
        DECISIONS_PATH,
        PRD_PATH,
    ]
    payload = {
        "schemaVersion": 1,
        "inventoryBasis": (
            "Exhaustive source and baseline evidence ledger. Source modal flags, "
            "benchmark assessment, implementation evidence, and owner disposition "
            "are separate fields; no owner disposition is inferred."
        ),
        "expectedRequirementCount": EXPECTED_REQUIREMENTS,
        "ownerDispositionAuthority": {
            "reference": repo_path(DECISIONS_PATH),
            "status": "D-01 through D-08 remain open; no decision is ratified.",
            "unratifiedDispositionFieldsRemainOpen": True,
        },
        "inputSha256": {
            repo_path(path): file_sha256(path) for path in inputs
        },
        "requirements": records,
    }
    validate_inventory(payload)
    return payload


def validate_inventory(payload):
    if payload.get("expectedRequirementCount") != EXPECTED_REQUIREMENTS:
        raise ValueError("Inventory expected requirement count is invalid")
    rows = payload.get("requirements")
    if not isinstance(rows, list) or len(rows) != EXPECTED_REQUIREMENTS:
        raise ValueError(
            f"Inventory must contain exactly {EXPECTED_REQUIREMENTS} rows"
        )
    ids = []
    for row in rows:
        requirement_id = row.get("id")
        if not isinstance(requirement_id, str) or not requirement_id:
            raise ValueError("Inventory row has no valid requirement ID")
        ids.append(requirement_id)
        if not row.get("title"):
            raise ValueError(f"{requirement_id} has no title")
        source = row.get("source", {})
        if (
            source.get("document") != repo_path(PRD_PATH)
            or source.get("documentSha256") != file_sha256(PRD_PATH)
            or not source.get("physicalPages")
            or not source.get("exactNormativeText")
        ):
            raise ValueError(f"{requirement_id} has an invalid source reference")
        if not source.get("benchmarkMatrix") or not source.get(
            "benchmarkRequirementSha256"
        ):
            raise ValueError(f"{requirement_id} has an invalid benchmark reference")
        modal = row.get("sourceModalEvidence", {}).get("row", {})
        if modal.get("id") != requirement_id:
            raise ValueError(f"{requirement_id} has a mismatched modal evidence row")
        flags = modal.get("source_modal_flags")
        if not isinstance(flags, dict) or not flags or any(
            not isinstance(value, bool) for value in flags.values()
        ):
            raise ValueError(f"{requirement_id} has invalid source modal flags")
        assessment = row.get("benchmarkAssessment", {})
        for field, allowed_values in STATUS_FIELDS.items():
            if assessment.get(field) not in allowed_values:
                raise ValueError(f"{requirement_id} has invalid {field}")
        facets = row.get("evidenceFacets", {})
        for field in (
            "frontendOwner",
            "backendOwner",
            "integrationOwner",
            "finalDispositionOwner",
            "frontendEvidence",
            "backendEvidence",
            "integrationEvidence",
            "reference",
        ):
            if not facets.get(field):
                raise ValueError(f"{requirement_id} is missing evidence facet {field}")
        owner = row.get("ownerDisposition", {})
        if owner.get("status") != "open" or any(
            owner.get(field) is not None
            for field in (
                "disposition",
                "decider",
                "ratificationDate",
                "authoritativeReference",
                "rationale",
                "compatibilityImpact",
            )
        ):
            raise ValueError(
                f"{requirement_id} contains an unratified owner disposition"
            )
        if row.get("review", {}).get("status") not in {
            "owner-review-required",
            "no-automated-review-cue",
        }:
            raise ValueError(f"{requirement_id} has an invalid review status")

    if len(set(ids)) != EXPECTED_REQUIREMENTS:
        raise ValueError("Inventory contains duplicate requirement IDs")
    benchmark_ids = {
        row["id"] for row in read_json(BENCHMARK_PATH)
    }
    if set(ids) != benchmark_ids:
        missing = sorted(benchmark_ids - set(ids))
        unknown = sorted(set(ids) - benchmark_ids)
        raise ValueError(
            f"Inventory benchmark ID mismatch; missing={missing}, unknown={unknown}"
        )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="verify the committed JSON matches deterministic source evidence",
    )
    args = parser.parse_args()
    payload = build_inventory()
    serialized = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if not OUTPUT_PATH.exists():
            raise ValueError(f"Missing generated inventory: {OUTPUT_PATH}")
        existing = OUTPUT_PATH.read_text(encoding="utf-8")
        if existing != serialized:
            raise ValueError(
                "Inventory differs from deterministic source evidence; "
                "regenerate without --check"
            )
    else:
        OUTPUT_PATH.write_text(serialized, encoding="utf-8", newline="\n")

    review_count = sum(
        row["review"]["status"] == "owner-review-required"
        for row in payload["requirements"]
    )
    print(
        f"{'Verified' if args.check else 'Generated'} "
        f"{len(payload['requirements'])} rows; "
        f"{len({row['id'] for row in payload['requirements']})} unique IDs; "
        f"{review_count} rows flagged for owner review; "
        "all owner dispositions remain open."
    )


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"CT-01 disposition inventory: {error}", file=sys.stderr)
        raise SystemExit(1)
