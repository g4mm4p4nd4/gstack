# Portfolio-OS GStack Integration

GStack consumes Portfolio-OS artifacts and produces reviewable JSON outputs for
evidence backfill, QA verification, and Hermes patch planning. The preferred
input for the Hermes flywheel is a `pos.hermes_task_bundle.v1` file.

## Commands

```sh
gstack-pos-evidence-hunt --bundle /Users/mnm/Documents/Github/portfolio-os/data/hermes_task_bundles/<run_id>.json
gstack-pos-build-qa --bundle /Users/mnm/Documents/Github/portfolio-os/data/hermes_task_bundles/<run_id>.json
gstack-pos-patch-plan --bundle /Users/mnm/Documents/Github/portfolio-os/data/hermes_task_bundles/<run_id>.json
```

Each command also accepts `--output <path>` for test runs or non-default
artifact locations.

## Outputs

When the bundle contains a `gstack` section, GStack writes to those exact paths:

- `gstack.evidence_backfill_path`
- `gstack.qa_verification_path`
- `gstack.patch_plan_path`

Otherwise the commands fall back to:

- `data/gstack_results/<run_id>.evidence_backfill.json`
- `data/gstack_results/<run_id>.qa_verification.json`
- `data/gstack_results/<run_id>.patch_plan.json`

## Contracts

Evidence output uses `gstack.pos_evidence_backfill.v1` and carries:

- missing evidence from the Hermes bundle
- Internet Pipes station gaps as `station_gaps`
- normalized Internet Pipes readiness in `internet_pipes`
- research questions
- suggested search queries
- the Portfolio-OS write-back location for market signal CSV updates

QA output uses `gstack.pos_qa_verification.v1` and carries:

- target repo path and branch
- QA report and screenshot output paths
- local HTML candidates when launch scaffolds exist
- Internet Pipes readiness and a launch-risk check when the station score is
  below `alpha_ready`
- blocked status when no target surface is available or Internet Pipes
  readiness has not reached `alpha_ready` or `factory_ready`

Patch planning output uses `gstack.pos_patch_plan.v1` and carries:

- Hermes tasks
- expected files
- safety policy
- Internet Pipes readiness for Hermes and operator review
- ordered patch sequence for the Hermes execution adapter

Retrieval context output uses `gstack.pos_retrieval_context.v1` and carries the
same `internet_pipes` block. Missing stations and recommendations are added to
retrieval query terms so bounded context favors proof-chain gaps instead of only
generic missing evidence.

The optional normalized shape is:

```json
{
  "internet_pipes": {
    "score": 48.25,
    "readiness": "promising",
    "missing_stations": ["evaluation", "visualization"],
    "recommendations": ["Add competitive and market mechanics evidence."],
    "source": "selection_snapshot.frozen_bundle.business_choice"
  }
}
```

GStack does not mutate target repositories in this flow. It emits artifacts that
Portfolio-OS and Hermes can inspect before any repo write occurs.
