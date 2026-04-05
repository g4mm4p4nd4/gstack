import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_WORKSPACE_ROOT = '/Users/mnm/Documents/Github';
const DEFAULT_PORTFOLIO_OS_DIR = path.join(DEFAULT_WORKSPACE_ROOT, 'portfolio-os');

type JsonRecord = Record<string, unknown>;

export type PosArtifactKind = 'dispatch' | 'selection_snapshot';

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
  const runId = asString(payload.run_id) ?? asString(selectionSnapshot?.run_id);
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
  return (
    asString(repoTarget?.target_repo_clone_path_hint)
    ?? asString(payload.target_repo_clone_path_hint)
    ?? lookupNestedString(selectionSnapshot, 'execution_manifest', 'repo_target', 'target_repo_clone_path_hint')
  );
}

function resolveTargetRepoFullName(payload: JsonRecord, selectionSnapshot: JsonRecord | null): string | null {
  const repoTarget = isRecord(payload.execution_manifest) && isRecord(payload.execution_manifest.repo_target)
    ? payload.execution_manifest.repo_target
    : null;
  return (
    asString(repoTarget?.target_repo_full_name)
    ?? asString(payload.target_repo_full_name)
    ?? lookupNestedString(selectionSnapshot, 'execution_manifest', 'repo_target', 'target_repo_full_name')
    ?? lookupNestedString(selectionSnapshot, 'launch_target', 'repo')
  );
}

function resolveTargetRepoBranch(payload: JsonRecord, selectionSnapshot: JsonRecord | null): string | null {
  const repoTarget = isRecord(payload.execution_manifest) && isRecord(payload.execution_manifest.repo_target)
    ? payload.execution_manifest.repo_target
    : null;
  return (
    asString(repoTarget?.target_repo_branch)
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
    missing_evidence: resolveMissingEvidence(artifact.selectionSnapshot),
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
