import { describe, test, expect } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  resolvePosEvidenceBackfillArtifact,
  resolvePosEvidencePlan,
  resolvePosPatchPlanArtifact,
  resolvePosQaPlan,
  resolvePosQaVerificationArtifact,
  resolvePosRetrievalContextArtifact,
  writePosEvidenceBackfillArtifact,
  writePosPatchPlanArtifact,
  writePosQaVerificationArtifact,
  writePosRetrievalContextArtifact,
} from '../lib/pos-artifacts';

function makeTempDir(prefix: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('POS artifact resolver', () => {
  test('dispatch input resolves QA output into the target repo clone when present', () => {
    const workspaceRoot = makeTempDir('gstack-pos-workspace-');
    const targetRepo = path.join(workspaceRoot, 'idea-spark');
    const scaffoldDir = path.join(workspaceRoot, 'portfolio-os', 'docs', 'launch_scaffolds', '2026-04-05', 'idea-spark-main');
    fs.mkdirSync(targetRepo, { recursive: true });
    fs.mkdirSync(scaffoldDir, { recursive: true });
    fs.writeFileSync(path.join(scaffoldDir, 'index.html'), '<html></html>', 'utf-8');
    fs.mkdirSync(path.join(workspaceRoot, 'portfolio-os', 'data', 'dispatch', 'outbox'), { recursive: true });

    const dispatchPath = path.join(workspaceRoot, 'portfolio-os', 'data', 'dispatch', 'outbox', 'dispatch_20260405T123000Z.json');
    fs.writeFileSync(dispatchPath, JSON.stringify({
      schema_version: 'pos.dispatch.v1',
      run_id: '20260405T123000Z',
      selection_snapshot_path: path.join(scaffoldDir, 'selection_snapshot.json'),
      target_repo_full_name: 'g4mm4p4nd4/idea-spark',
      target_repo_branch: 'main',
      target_repo_clone_path_hint: targetRepo,
      cockpit: {
        portfolio_os_dir: path.join(workspaceRoot, 'portfolio-os'),
      },
      execution_manifest: {
        repo_target: {
          target_repo_clone_path_hint: targetRepo,
          target_repo_full_name: 'g4mm4p4nd4/idea-spark',
          target_repo_branch: 'main',
        },
      },
      selection_snapshot: {
        run_id: '20260405T123000Z',
        artifacts: {
          scaffold_dir: scaffoldDir,
          launch_packet_path: path.join(workspaceRoot, 'portfolio-os', 'docs', 'launch_packets', '2026-04-05', 'idea-spark-main.md'),
        },
      },
    }, null, 2));

    const plan = resolvePosQaPlan(dispatchPath);
    expect(plan.run_id).toBe('20260405T123000Z');
    expect(plan.target_repo_clone_path).toBe(targetRepo);
    expect(plan.qa_output_root).toBe(path.join(targetRepo, '.gstack', 'pos', '20260405T123000Z', 'qa'));
    expect(plan.local_html_candidates).toEqual([path.join(scaffoldDir, 'index.html')]);
  });

  test('selection snapshot input falls back to the scaffold directory when no target clone exists', () => {
    const workspaceRoot = makeTempDir('gstack-pos-workspace-');
    const scaffoldDir = path.join(workspaceRoot, 'portfolio-os', 'docs', 'launch_scaffolds', '2026-04-05', 'idea-spark-main');
    fs.mkdirSync(scaffoldDir, { recursive: true });
    const snapshotPath = path.join(scaffoldDir, 'selection_snapshot.json');
    fs.writeFileSync(snapshotPath, JSON.stringify({
      schema_version: 'pos.selection_snapshot.v1',
      run_id: '20260405T130000Z',
      frozen_bundle: {
        missing_evidence: ['Need creator VOC', 'Need dated market signal'],
        business_choice: {
          internet_pipes_score: 48.25,
          internet_pipes_readiness: 'promising',
          internet_pipes_missing_stations: ['evaluation', 'visualization'],
          internet_pipes_recommendations: ['Add competitive and market mechanics evidence.'],
        },
      },
      launch_target: {
        repo: 'g4mm4p4nd4/idea-spark',
      },
      execution_manifest: {
        repo_target: {
          target_repo_clone_path_hint: path.join(workspaceRoot, 'idea-spark'),
        },
      },
      artifacts: {
        scaffold_dir: scaffoldDir,
      },
    }, null, 2));

    const qaPlan = resolvePosQaPlan(snapshotPath);
    expect(qaPlan.qa_output_root).toBe(path.join(scaffoldDir, 'qa', '20260405T130000Z'));
    expect(qaPlan.internet_pipes).toEqual({
      score: 48.25,
      readiness: 'promising',
      missing_stations: ['evaluation', 'visualization'],
      recommendations: ['Add competitive and market mechanics evidence.'],
      source: 'selection_snapshot.frozen_bundle.business_choice',
    });

    const evidencePlan = resolvePosEvidencePlan(snapshotPath);
    expect(evidencePlan.missing_evidence).toEqual(['Need creator VOC', 'Need dated market signal']);
    expect(evidencePlan.station_gaps).toEqual([
      'Internet Pipes station gap: evaluation',
      'Internet Pipes station gap: visualization',
    ]);
    expect(evidencePlan.evidence_backfill_path).toBe(
      path.join(workspaceRoot, 'portfolio-os', 'data', 'dispatch', 'inbox', 'evidence_20260405T130000Z.json'),
    );
  });

  test('Hermes task bundle produces evidence, QA, and patch-plan artifacts', () => {
    const workspaceRoot = makeTempDir('gstack-pos-hermes-');
    const portfolioRoot = path.join(workspaceRoot, 'portfolio-os');
    const targetRepo = path.join(workspaceRoot, 'fixture-target');
    const resultRoot = path.join(portfolioRoot, 'data', 'gstack_results');
    fs.mkdirSync(path.join(portfolioRoot, 'data', 'hermes_task_bundles'), { recursive: true });
    fs.mkdirSync(targetRepo, { recursive: true });
    const bundlePath = path.join(portfolioRoot, 'data', 'hermes_task_bundles', 'fixture-validation-sprint.json');
    const bundle = {
      schema_version: 'pos.hermes_task_bundle.v1',
      run: {
        run_id: 'fixture-validation-sprint',
      },
      target: {
        repo_full_name: 'owner/fixture-target',
        local_repo_path: targetRepo,
        default_branch: 'main',
      },
      opportunity: {
        mandate_type: 'validation_sprint',
        niche: 'marketing teams in marketing',
        internet_pipes_score: 63.5,
        internet_pipes_readiness: 'promising',
        internet_pipes_missing_stations: ['differentiation'],
        internet_pipes_recommendations: ['Add explicit differentiation evidence from review gaps.'],
      },
      tasks: [
        {
          id: 'business-plan',
          type: 'business_plan',
          assigned_role: 'CEO / Operator',
          files_expected: ['docs/business_plan.md'],
        },
        {
          id: 'qa',
          type: 'QA',
          assigned_role: 'QA / Launch Readiness',
          files_expected: [],
        },
      ],
      evidence: {
        missing_evidence: ['Need 3 buyer quotes.', 'Need dated market signal.'],
      },
      gstack: {
        evidence_backfill_path: path.join(resultRoot, 'fixture-validation-sprint.evidence_backfill.json'),
        qa_verification_path: path.join(resultRoot, 'fixture-validation-sprint.qa_verification.json'),
        patch_plan_path: path.join(resultRoot, 'fixture-validation-sprint.patch_plan.json'),
      },
      safety: {
        destructive_ops_allowed: false,
        secrets_scan_required: true,
        forbidden_operations: ['delete_repo', 'rewrite_history', 'remove_license', 'commit_secrets'],
      },
    };
    fs.writeFileSync(bundlePath, JSON.stringify(bundle, null, 2), 'utf-8');

    const evidence = resolvePosEvidenceBackfillArtifact(bundlePath);
    expect(evidence.input_kind).toBe('hermes_task_bundle');
    expect(evidence.status).toBe('ready_for_research');
    expect(evidence.internet_pipes.readiness).toBe('promising');
    expect(evidence.station_gaps).toEqual(['Internet Pipes station gap: differentiation']);
    expect(evidence.research_questions).toHaveLength(4);
    expect(evidence.suggested_queries.join('\n')).toContain('buyer quotes');
    expect(evidence.suggested_queries.join('\n')).toContain('differentiation');

    const qa = resolvePosQaVerificationArtifact(bundlePath);
    expect(qa.status).toBe('blocked_internet_pipes_completeness');
    expect(qa.target_repo_clone_path).toBe(targetRepo);
    expect(qa.qa_output_root).toBe(path.join(targetRepo, '.gstack', 'pos', 'fixture-validation-sprint', 'qa'));
    expect(qa.checks).toContainEqual(expect.objectContaining({
      id: 'internet-pipes-completeness',
      status: 'blocked',
      readiness: 'promising',
      missing_stations: ['differentiation'],
    }));

    const patch = resolvePosPatchPlanArtifact(bundlePath);
    expect(patch.status).toBe('ready_for_hermes');
    expect(patch.files_expected).toEqual(['docs/business_plan.md']);
    expect(patch.patch_sequence.map((step) => step.task_id)).toEqual(['business-plan', 'qa']);
    expect(patch.internet_pipes).toEqual(evidence.internet_pipes);

    const evidencePath = writePosEvidenceBackfillArtifact(bundlePath);
    const qaPath = writePosQaVerificationArtifact(bundlePath);
    const patchPath = writePosPatchPlanArtifact(bundlePath);
    expect(evidencePath).toBe(bundle.gstack.evidence_backfill_path);
    expect(qaPath).toBe(bundle.gstack.qa_verification_path);
    expect(patchPath).toBe(bundle.gstack.patch_plan_path);
    expect(fs.existsSync(evidencePath)).toBe(true);
    expect(fs.existsSync(qaPath)).toBe(true);
    expect(fs.existsSync(patchPath)).toBe(true);
  });

  test('Hermes task bundle produces bounded retrieval context with cited hashes and no raw vectors', () => {
    const workspaceRoot = makeTempDir('gstack-pos-retrieval-');
    const portfolioRoot = path.join(workspaceRoot, 'portfolio-os');
    const targetRepo = path.join(workspaceRoot, 'fixture-target');
    const resultRoot = path.join(portfolioRoot, 'data', 'gstack_results');
    const packPath = path.join(portfolioRoot, 'context-packs', 'fixture-target-map.md');
    const ledgerPath = path.join(portfolioRoot, 'data', 'paperclip-ledger', 'run.json');
    fs.mkdirSync(path.dirname(packPath), { recursive: true });
    fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
    fs.mkdirSync(path.join(portfolioRoot, 'data', 'hermes_task_bundles'), { recursive: true });
    fs.mkdirSync(targetRepo, { recursive: true });
    fs.writeFileSync(packPath, [
      '# fixture-target map',
      'The validation sprint needs a buyer quote from marketing teams.',
      'The pricing task should cite dated SaaS pricing proof.',
    ].join('\n'), 'utf-8');
    fs.writeFileSync(ledgerPath, JSON.stringify({
      promptClass: 'failure_recovery',
      blocker: 'pytest failed in tests/test_checkout.py:42',
      receiptPath: '/tmp/receipt.json',
    }, null, 2), 'utf-8');

    const bundlePath = path.join(portfolioRoot, 'data', 'hermes_task_bundles', 'fixture-validation-sprint.json');
    const bundle = {
      schema_version: 'pos.hermes_task_bundle.v1',
      run: {
        run_id: 'fixture-validation-sprint',
      },
      target: {
        repo_full_name: 'owner/fixture-target',
        local_repo_path: targetRepo,
        default_branch: 'main',
      },
      opportunity: {
        mandate_type: 'validation_sprint',
        niche: 'marketing teams',
      },
      paperclip: {
        context_ledger: {
          run_ledger_path: ledgerPath,
          context_pack_refs: [
            {
              packPath,
              packSha: 'declared-pack-sha',
              freshnessStatus: 'fresh',
            },
          ],
        },
      },
      context: {
        packs: [
          {
            packPath,
            packSha: 'declared-pack-sha',
            freshnessStatus: 'fresh',
          },
        ],
      },
      tasks: [
        {
          id: 'validation-plan',
          title: 'Create the validation sprint plan',
          type: 'validation_plan',
          assigned_role: 'Product Manager',
          files_expected: ['docs/validation_plan.md'],
        },
        {
          id: 'pricing',
          title: 'Draft the pricing hypothesis',
          type: 'pricing',
          assigned_role: 'Finance / Pricing Strategist',
          files_expected: ['docs/pricing.md'],
        },
      ],
      evidence: {
        missing_evidence: ['Need buyer quote from marketing teams.', 'Need dated SaaS pricing proof.'],
        internet_pipes: {
          score: 52.25,
          readiness: 'insufficient',
          missing_stations: ['evaluation'],
          recommendations: ['Add competitive and market mechanics evidence.'],
        },
      },
      gstack: {
        retrieval_context_path: path.join(resultRoot, 'fixture-validation-sprint.retrieval_context.json'),
      },
    };
    fs.writeFileSync(bundlePath, JSON.stringify(bundle, null, 2), 'utf-8');

    const artifact = resolvePosRetrievalContextArtifact(bundlePath);

    expect(artifact.schema_version).toBe('gstack.pos_retrieval_context.v1');
    expect(artifact.status).toBe('ready');
    expect(artifact.policy.raw_vectors_included).toBe(false);
    expect(artifact.policy.hermes_system_prompt_mutated).toBe(false);
    expect(artifact.policy.pointer_only_context_allowed).toBe(false);
    expect(artifact.budget.max_snippets).toBe(8);
    expect(artifact.budget.estimated_tokens).toBeGreaterThan(0);
    expect(artifact.internet_pipes).toEqual({
      score: 52.25,
      readiness: 'insufficient',
      missing_stations: ['evaluation'],
      recommendations: ['Add competitive and market mechanics evidence.'],
      source: 'payload.evidence.internet_pipes',
    });
    expect(artifact.query_terms).toContain('evaluation');
    expect(artifact.query_terms).toContain('Add competitive and market mechanics evidence.');
    expect(artifact.snippets.length).toBeGreaterThanOrEqual(2);
    expect(artifact.snippets.every((snippet) => snippet.source_path && snippet.score > 0 && snippet.source_hash && snippet.snippet_hash)).toBe(true);
    expect(artifact.snippets.some((snippet) => snippet.source_path === packPath && snippet.text.includes('buyer quote'))).toBe(true);
    expect(artifact.snippets.some((snippet) => snippet.source_path === ledgerPath && snippet.text.includes('failure_recovery'))).toBe(true);
    expect(JSON.stringify(artifact)).not.toContain('[0.123');

    const outPath = writePosRetrievalContextArtifact(bundlePath);
    expect(outPath).toBe(bundle.gstack.retrieval_context_path);
    expect(fs.existsSync(outPath)).toBe(true);
  });
});
