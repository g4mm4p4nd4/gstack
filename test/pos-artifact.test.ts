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
  writePosEvidenceBackfillArtifact,
  writePosPatchPlanArtifact,
  writePosQaVerificationArtifact,
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

    const evidencePlan = resolvePosEvidencePlan(snapshotPath);
    expect(evidencePlan.missing_evidence).toEqual(['Need creator VOC', 'Need dated market signal']);
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
    expect(evidence.research_questions).toHaveLength(2);
    expect(evidence.suggested_queries.join('\n')).toContain('buyer quotes');

    const qa = resolvePosQaVerificationArtifact(bundlePath);
    expect(qa.status).toBe('ready_for_qa');
    expect(qa.target_repo_clone_path).toBe(targetRepo);
    expect(qa.qa_output_root).toBe(path.join(targetRepo, '.gstack', 'pos', 'fixture-validation-sprint', 'qa'));

    const patch = resolvePosPatchPlanArtifact(bundlePath);
    expect(patch.status).toBe('ready_for_hermes');
    expect(patch.files_expected).toEqual(['docs/business_plan.md']);
    expect(patch.patch_sequence.map((step) => step.task_id)).toEqual(['business-plan', 'qa']);

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
});
