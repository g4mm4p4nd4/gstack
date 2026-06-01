import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_WORKSPACE_ROOT = '/Users/mnm/Documents/Github';
const DEFAULT_PORTFOLIO_OS_DIR = path.join(DEFAULT_WORKSPACE_ROOT, 'portfolio-os');

type JsonRecord = Record<string, unknown>;

export type PosArtifactKind = 'dispatch' | 'selection_snapshot' | 'hermes_task_bundle';

export interface PosArtifact {
  kind: PosArtifactKind;
  artifactPath: string;
  payload: JsonRecord;
  selectionSnapshot: JsonRecord | null;
}

export interface PosQaPlan {
  input_kind: PosArtifactKind;
  input_path: string;
  run_id: string;
  schema_version: string | null;
  selection_snapshot_path: string | null;
  target_repo_full_name: string | null;
  target_repo_branch: string | null;
  target_repo_clone_path: string | null;
  scaffold_dir: string | null;
  launch_packet_path: string | null;
  qa_output_root: string;
  qa_report_path: string;
  screenshots_dir: string;
  regression_notes_path: string;
  local_html_candidates: string[];
}

export interface PosEvidencePlan {
  input_kind: PosArtifactKind;
  input_path: string;
  run_id: string;
  schema_version: string | null;
  selection_snapshot_path: string | null;
  missing_evidence: unknown[];
  evidence_backfill_path: string;
}

export interface PosEvidenceBackfillArtifact {
  schema_version: 'gstack.pos_evidence_backfill.v1';
  generated_at: string;
  input_kind: PosArtifactKind;
  input_path: string;
  run_id: string;
  target_repo_full_name: string | null;
  missing_evidence: unknown[];
  research_questions: string[];
  suggested_queries: string[];
  evidence_write_back_path: string;
  status: 'ready_for_research' | 'blocked_no_missing_evidence';
}

export interface PosQaVerificationArtifact {
  schema_version: 'gstack.pos_qa_verification.v1';
  generated_at: string;
  input_kind: PosArtifactKind;
  input_path: string;
  run_id: string;
  target_repo_full_name: string | null;
  target_repo_branch: string | null;
  target_repo_clone_path: string | null;
  qa_output_root: string;
  qa_report_path: string;
  screenshots_dir: string;
  local_html_candidates: string[];
  checks: JsonRecord[];
  status: 'ready_for_qa' | 'blocked_no_target_surface';
}

export interface PosPatchPlanArtifact {
  schema_version: 'gstack.pos_patch_plan.v1';
  generated_at: string;
  input_kind: PosArtifactKind;
  input_path: string;
  run_id: string;
  target_repo_full_name: string | null;
  target_repo_branch: string | null;
  target_repo_clone_path: string | null;
  mandate_type: string | null;
  tasks: JsonRecord[];
  files_expected: string[];
  safety: JsonRecord;
  patch_sequence: JsonRecord[];
  status: 'ready_for_hermes' | 'blocked_no_tasks';
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function pathExists(candidate: string | null): candidate is string {
  return Boolean(candidate) && fs.existsSync(candidate);
}

function readJsonFile(filePath: string): JsonRecord {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw);
  if (!isRecord(parsed)) {
    throw new Error(`Expected a JSON object at ${filePath}`);
  }
  return parsed;
}

function inferArtifactKind(payload: JsonRecord, artifactPath: string): PosArtifactKind {
  const schemaVersion = asString(payload.schema_version);
  if (schemaVersion === 'pos.dispatch.v1') return 'dispatch';
  if (schemaVersion === 'pos.selection_snapshot.v1') return 'selection_snapshot';
  if (schemaVersion === 'pos.hermes_task_bundle.v1') return 'hermes_task_bundle';
  return path.basename(artifactPath).startsWith('dispatch_') ? 'dispatch' : 'selection_snapshot';
}

function resolveSelectionSnapshot(payload: JsonRecord, kind: PosArtifactKind): JsonRecord | null {
  if (kind === 'selection_snapshot') return payload;
  const embedded = payload.selection_snapshot;
  return isRecord(embedded) ? embedded : null;
}

function lookupNestedString(record: JsonRecord | null, ...pathParts: string[]): string | null {
  let cursor: unknown = record;
  for (const part of pathParts) {
    if (!isRecord(cursor)) return null;
    cursor = cursor[part];
  }
  return asString(cursor);
}

function resolveRunId(payload: JsonRecord, selectionSnapshot: JsonRecord | null): string {
  const run = isRecord(payload.run) ? payload.run : null;
  const runId = asString(payload.run_id) ?? asString(run?.run_id) ?? asString(selectionSnapshot?.run_id);
  if (!runId) throw new Error('POS artifact is missing run_id');
  return runId;
}

function resolveSelectionSnapshotPath(payload: JsonRecord, artifactPath: string, kind: PosArtifactKind): string | null {
  if (kind === 'selection_snapshot') return artifactPath;
  return asString(payload.selection_snapshot_path);
}

function resolveTargetRepoClonePath(payload: JsonRecord, selectionSnapshot: JsonRecord | null): string | null {
  const repoTarget = isRecord(payload.execution_manifest) && isRecord(payload.execution_manifest.repo_target)
    ? payload.execution_manifest.repo_target
    : null;
  const target = isRecord(payload.target) ? payload.target : null;
  return (
    asString(target?.local_repo_path)
    ?? asString(repoTarget?.target_repo_clone_path_hint)
    ?? asString(payload.target_repo_clone_path_hint)
    ?? lookupNestedString(selectionSnapshot, 'execution_manifest', 'repo_target', 'target_repo_clone_path_hint')
  );
}

function resolveTargetRepoFullName(payload: JsonRecord, selectionSnapshot: JsonRecord | null): string | null {
  const repoTarget = isRecord(payload.execution_manifest) && isRecord(payload.execution_manifest.repo_target)
    ? payload.execution_manifest.repo_target
    : null;
  const target = isRecord(payload.target) ? payload.target : null;
  return (
    asString(target?.repo_full_name)
    ?? asString(repoTarget?.target_repo_full_name)
    ?? asString(payload.target_repo_full_name)
    ?? lookupNestedString(selectionSnapshot, 'execution_manifest', 'repo_target', 'target_repo_full_name')
    ?? lookupNestedString(selectionSnapshot, 'launch_target', 'repo')
  );
}

function resolveTargetRepoBranch(payload: JsonRecord, selectionSnapshot: JsonRecord | null): string | null {
  const repoTarget = isRecord(payload.execution_manifest) && isRecord(payload.execution_manifest.repo_target)
    ? payload.execution_manifest.repo_target
    : null;
  const target = isRecord(payload.target) ? payload.target : null;
  return (
    asString(target?.default_branch)
    ?? asString(repoTarget?.target_repo_branch)
    ?? asString(payload.target_repo_branch)
    ?? lookupNestedString(selectionSnapshot, 'execution_manifest', 'repo_target', 'target_repo_branch')
    ?? lookupNestedString(selectionSnapshot, 'launch_target', 'robust_branch')
  );
}

function resolveScaffoldDir(selectionSnapshot: JsonRecord | null): string | null {
  return lookupNestedString(selectionSnapshot, 'artifacts', 'scaffold_dir');
}

function resolveLaunchPacketPath(selectionSnapshot: JsonRecord | null): string | null {
  return lookupNestedString(selectionSnapshot, 'artifacts', 'launch_packet_path');
}

function collectLocalHtmlCandidates(scaffoldDir: string | null): string[] {
  if (!pathExists(scaffoldDir)) return [];
  return fs.readdirSync(scaffoldDir)
    .filter((entry) => entry.endsWith('.html'))
    .map((entry) => path.join(scaffoldDir, entry))
    .sort((left, right) => {
      if (path.basename(left) === 'index.html') return -1;
      if (path.basename(right) === 'index.html') return 1;
      return left.localeCompare(right);
    });
}

function resolveWorkspaceRoot(payload: JsonRecord, artifactPath: string): string {
  const cockpit = isRecord(payload.cockpit) ? payload.cockpit : null;
  const posDir = asString(cockpit?.portfolio_os_dir)
    ?? findRepoRootInPath(artifactPath, 'portfolio-os')
    ?? DEFAULT_PORTFOLIO_OS_DIR;
  return path.dirname(posDir);
}

function findRepoRootInPath(candidatePath: string, repoName: string): string | null {
  const absolute = path.resolve(candidatePath);
  const marker = `${path.sep}${repoName}${path.sep}`;
  const markerIndex = absolute.indexOf(marker);
  if (markerIndex === -1) return null;
  return absolute.slice(0, markerIndex + marker.length - 1);
}

function resolveMissingEvidence(selectionSnapshot: JsonRecord | null): unknown[] {
  const frozenBundle = isRecord(selectionSnapshot?.frozen_bundle) ? selectionSnapshot.frozen_bundle : null;
  return asArray(frozenBundle?.missing_evidence ?? selectionSnapshot?.missing_evidence);
}

function resolveMissingEvidenceForArtifact(payload: JsonRecord, selectionSnapshot: JsonRecord | null): unknown[] {
  const evidence = isRecord(payload.evidence) ? payload.evidence : null;
  const opportunity = isRecord(payload.opportunity) ? payload.opportunity : null;
  const direct = asArray(evidence?.missing_evidence);
  if (direct.length > 0) return direct;
  const opportunityMissing = asArray(opportunity?.missing_evidence);
  if (opportunityMissing.length > 0) return opportunityMissing;
  return resolveMissingEvidence(selectionSnapshot);
}

function resolveGstackOutputPath(payload: JsonRecord, workspaceRoot: string, runId: string, key: string, suffix: string): string {
  const gstack = isRecord(payload.gstack) ? payload.gstack : null;
  return asString(gstack?.[key]) ?? path.join(workspaceRoot, 'portfolio-os', 'data', 'gstack_results', `${runId}.${suffix}.json`);
}

function nowIso(): string {
  return new Date().toISOString();
}

function writeJsonFile(filePath: string, payload: JsonRecord): string {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
  return filePath;
}

function uniqueStrings(values: unknown[]): string[] {
  return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0).map((value) => value.trim())));
}

function resolveMandateType(payload: JsonRecord): string | null {
  const opportunity = isRecord(payload.opportunity) ? payload.opportunity : null;
  const mandate = isRecord(payload.mandate) ? payload.mandate : null;
  return asString(opportunity?.mandate_type) ?? asString(mandate?.mandate_type);
}

function resolveTasks(payload: JsonRecord): JsonRecord[] {
  return asArray(payload.tasks).filter(isRecord);
}

function collectExpectedFiles(tasks: JsonRecord[]): string[] {
  const files: string[] = [];
  for (const task of tasks) {
    for (const file of asArray(task.files_expected)) {
      if (typeof file === 'string' && file.trim()) files.push(file.trim());
    }
  }
  return Array.from(new Set(files)).sort();
}

function queryFromMissingEvidence(targetRepo: string | null, missingEvidence: unknown[]): string[] {
  const repoTerm = targetRepo ? targetRepo.split('/').pop() : 'portfolio product';
  return uniqueStrings(missingEvidence).flatMap((item) => [
    `"${repoTerm}" ${item}`,
    `${item} buyer complaints forum`,
    `${item} SaaS pricing proof`,
  ]);
}

export function loadPosArtifact(artifactPath: string): PosArtifact {
  const absolute = path.resolve(artifactPath);
  const payload = readJsonFile(absolute);
  const kind = inferArtifactKind(payload, absolute);
  return {
    kind,
    artifactPath: absolute,
    payload,
    selectionSnapshot: resolveSelectionSnapshot(payload, kind),
  };
}

export function resolvePosQaPlan(artifactPath: string): PosQaPlan {
  const artifact = loadPosArtifact(artifactPath);
  const runId = resolveRunId(artifact.payload, artifact.selectionSnapshot);
  const targetRepoClonePath = resolveTargetRepoClonePath(artifact.payload, artifact.selectionSnapshot);
  const scaffoldDir = resolveScaffoldDir(artifact.selectionSnapshot);
  const qaOutputRoot = pathExists(targetRepoClonePath)
    ? path.join(targetRepoClonePath, '.gstack', 'pos', runId, 'qa')
    : scaffoldDir
      ? path.join(scaffoldDir, 'qa', runId)
      : path.join(path.dirname(artifact.artifactPath), `qa-${runId}`);

  return {
    input_kind: artifact.kind,
    input_path: artifact.artifactPath,
    run_id: runId,
    schema_version: asString(artifact.payload.schema_version),
    selection_snapshot_path: resolveSelectionSnapshotPath(artifact.payload, artifact.artifactPath, artifact.kind),
    target_repo_full_name: resolveTargetRepoFullName(artifact.payload, artifact.selectionSnapshot),
    target_repo_branch: resolveTargetRepoBranch(artifact.payload, artifact.selectionSnapshot),
    target_repo_clone_path: targetRepoClonePath,
    scaffold_dir: scaffoldDir,
    launch_packet_path: resolveLaunchPacketPath(artifact.selectionSnapshot),
    qa_output_root: qaOutputRoot,
    qa_report_path: path.join(qaOutputRoot, 'qa_report.md'),
    screenshots_dir: path.join(qaOutputRoot, 'screenshots'),
    regression_notes_path: path.join(qaOutputRoot, 'regression_notes.md'),
    local_html_candidates: collectLocalHtmlCandidates(scaffoldDir),
  };
}

export function resolvePosEvidencePlan(artifactPath: string): PosEvidencePlan {
  const artifact = loadPosArtifact(artifactPath);
  const runId = resolveRunId(artifact.payload, artifact.selectionSnapshot);
  const workspaceRoot = resolveWorkspaceRoot(artifact.payload, artifact.artifactPath);
  return {
    input_kind: artifact.kind,
    input_path: artifact.artifactPath,
    run_id: runId,
    schema_version: asString(artifact.payload.schema_version),
    selection_snapshot_path: resolveSelectionSnapshotPath(artifact.payload, artifact.artifactPath, artifact.kind),
    missing_evidence: resolveMissingEvidenceForArtifact(artifact.payload, artifact.selectionSnapshot),
    evidence_backfill_path: path.join(
      workspaceRoot,
      'portfolio-os',
      'data',
      'dispatch',
      'inbox',
      `evidence_${runId}.json`,
    ),
  };
}

export function resolvePosEvidenceBackfillArtifact(artifactPath: string): PosEvidenceBackfillArtifact {
  const artifact = loadPosArtifact(artifactPath);
  const runId = resolveRunId(artifact.payload, artifact.selectionSnapshot);
  const workspaceRoot = resolveWorkspaceRoot(artifact.payload, artifact.artifactPath);
  const targetRepo = resolveTargetRepoFullName(artifact.payload, artifact.selectionSnapshot);
  const missingEvidence = resolveMissingEvidenceForArtifact(artifact.payload, artifact.selectionSnapshot);
  const questions = uniqueStrings(missingEvidence).map((item) => `What dated external proof resolves this gap: ${item}?`);
  return {
    schema_version: 'gstack.pos_evidence_backfill.v1',
    generated_at: nowIso(),
    input_kind: artifact.kind,
    input_path: artifact.artifactPath,
    run_id: runId,
    target_repo_full_name: targetRepo,
    missing_evidence: missingEvidence,
    research_questions: questions,
    suggested_queries: queryFromMissingEvidence(targetRepo, missingEvidence),
    evidence_write_back_path: path.join(workspaceRoot, 'portfolio-os', 'inputs', 'market_signals', 'latest.csv'),
    status: missingEvidence.length > 0 ? 'ready_for_research' : 'blocked_no_missing_evidence',
  };
}

export function resolvePosQaVerificationArtifact(artifactPath: string): PosQaVerificationArtifact {
  const plan = resolvePosQaPlan(artifactPath);
  const hasSurface = pathExists(plan.target_repo_clone_path) || plan.local_html_candidates.length > 0;
  return {
    schema_version: 'gstack.pos_qa_verification.v1',
    generated_at: nowIso(),
    input_kind: plan.input_kind,
    input_path: plan.input_path,
    run_id: plan.run_id,
    target_repo_full_name: plan.target_repo_full_name,
    target_repo_branch: plan.target_repo_branch,
    target_repo_clone_path: plan.target_repo_clone_path,
    qa_output_root: plan.qa_output_root,
    qa_report_path: plan.qa_report_path,
    screenshots_dir: plan.screenshots_dir,
    local_html_candidates: plan.local_html_candidates,
    checks: [
      { id: 'target-repo-present', status: pathExists(plan.target_repo_clone_path) ? 'pass' : 'blocked' },
      { id: 'local-html-candidates', status: plan.local_html_candidates.length > 0 ? 'pass' : 'not_applicable', count: plan.local_html_candidates.length },
      { id: 'qa-report-path-ready', status: 'ready', path: plan.qa_report_path },
    ],
    status: hasSurface ? 'ready_for_qa' : 'blocked_no_target_surface',
  };
}

export function resolvePosPatchPlanArtifact(artifactPath: string): PosPatchPlanArtifact {
  const artifact = loadPosArtifact(artifactPath);
  const runId = resolveRunId(artifact.payload, artifact.selectionSnapshot);
  const tasks = resolveTasks(artifact.payload);
  const filesExpected = collectExpectedFiles(tasks);
  return {
    schema_version: 'gstack.pos_patch_plan.v1',
    generated_at: nowIso(),
    input_kind: artifact.kind,
    input_path: artifact.artifactPath,
    run_id: runId,
    target_repo_full_name: resolveTargetRepoFullName(artifact.payload, artifact.selectionSnapshot),
    target_repo_branch: resolveTargetRepoBranch(artifact.payload, artifact.selectionSnapshot),
    target_repo_clone_path: resolveTargetRepoClonePath(artifact.payload, artifact.selectionSnapshot),
    mandate_type: resolveMandateType(artifact.payload),
    tasks,
    files_expected: filesExpected,
    safety: isRecord(artifact.payload.safety) ? artifact.payload.safety : {
      destructive_ops_allowed: false,
      secrets_scan_required: true,
      forbidden_operations: ['delete_repo', 'rewrite_history', 'remove_license', 'commit_secrets'],
    },
    patch_sequence: tasks.map((task, index) => ({
      order: index + 1,
      task_id: asString(task.id),
      task_type: asString(task.type),
      assigned_role: asString(task.assigned_role),
      files_expected: asArray(task.files_expected),
    })),
    status: tasks.length > 0 ? 'ready_for_hermes' : 'blocked_no_tasks',
  };
}

export function writePosEvidenceBackfillArtifact(artifactPath: string, outputPath?: string): string {
  const artifact = loadPosArtifact(artifactPath);
  const runId = resolveRunId(artifact.payload, artifact.selectionSnapshot);
  const workspaceRoot = resolveWorkspaceRoot(artifact.payload, artifact.artifactPath);
  const out = outputPath ?? resolveGstackOutputPath(artifact.payload, workspaceRoot, runId, 'evidence_backfill_path', 'evidence_backfill');
  return writeJsonFile(out, resolvePosEvidenceBackfillArtifact(artifactPath) as unknown as JsonRecord);
}

export function writePosQaVerificationArtifact(artifactPath: string, outputPath?: string): string {
  const artifact = loadPosArtifact(artifactPath);
  const runId = resolveRunId(artifact.payload, artifact.selectionSnapshot);
  const workspaceRoot = resolveWorkspaceRoot(artifact.payload, artifact.artifactPath);
  const out = outputPath ?? resolveGstackOutputPath(artifact.payload, workspaceRoot, runId, 'qa_verification_path', 'qa_verification');
  return writeJsonFile(out, resolvePosQaVerificationArtifact(artifactPath) as unknown as JsonRecord);
}

export function writePosPatchPlanArtifact(artifactPath: string, outputPath?: string): string {
  const artifact = loadPosArtifact(artifactPath);
  const runId = resolveRunId(artifact.payload, artifact.selectionSnapshot);
  const workspaceRoot = resolveWorkspaceRoot(artifact.payload, artifact.artifactPath);
  const out = outputPath ?? resolveGstackOutputPath(artifact.payload, workspaceRoot, runId, 'patch_plan_path', 'patch_plan');
  return writeJsonFile(out, resolvePosPatchPlanArtifact(artifactPath) as unknown as JsonRecord);
}
