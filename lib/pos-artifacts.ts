import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

const DEFAULT_WORKSPACE_ROOT = '/Users/mnm/Documents/Github';
const DEFAULT_PORTFOLIO_OS_DIR = path.join(DEFAULT_WORKSPACE_ROOT, 'portfolio-os');
const INTERNET_PIPES_DISPATCH_READY = new Set(['alpha_ready', 'factory_ready']);

type JsonRecord = Record<string, unknown>;

export type PosArtifactKind = 'dispatch' | 'selection_snapshot' | 'hermes_task_bundle';

export interface PosArtifact {
  kind: PosArtifactKind;
  artifactPath: string;
  payload: JsonRecord;
  selectionSnapshot: JsonRecord | null;
}

export interface PosInternetPipesCompleteness {
  score: number | null;
  readiness: string | null;
  missing_stations: string[];
  recommendations: string[];
  source: string | null;
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
  internet_pipes: PosInternetPipesCompleteness;
}

export interface PosEvidencePlan {
  input_kind: PosArtifactKind;
  input_path: string;
  run_id: string;
  schema_version: string | null;
  selection_snapshot_path: string | null;
  missing_evidence: unknown[];
  station_gaps: string[];
  internet_pipes: PosInternetPipesCompleteness;
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
  station_gaps: string[];
  internet_pipes: PosInternetPipesCompleteness;
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
  internet_pipes: PosInternetPipesCompleteness;
  checks: JsonRecord[];
  status: 'ready_for_qa' | 'blocked_no_target_surface' | 'blocked_internet_pipes_completeness';
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
  internet_pipes: PosInternetPipesCompleteness;
  patch_sequence: JsonRecord[];
  status: 'ready_for_hermes' | 'blocked_no_tasks';
}

export interface PosRetrievalSnippet {
  source_path: string;
  source_kind: string;
  source_hash: string;
  snippet_hash: string;
  freshness: string;
  score: number;
  line_start: number;
  line_end: number;
  text: string;
}

export interface PosRetrievalContextArtifact {
  schema_version: 'gstack.pos_retrieval_context.v1';
  generated_at: string;
  input_kind: PosArtifactKind;
  input_path: string;
  run_id: string;
  target_repo_full_name: string | null;
  internet_pipes: PosInternetPipesCompleteness;
  budget: {
    max_snippets: number;
    max_chars_per_snippet: number;
    max_total_chars: number;
    estimated_tokens: number;
  };
  policy: {
    raw_vectors_included: false;
    hermes_system_prompt_mutated: false;
    pointer_only_context_allowed: false;
  };
  query_terms: string[];
  snippets: PosRetrievalSnippet[];
  sources_considered: JsonRecord[];
  status: 'ready' | 'blocked_no_sources' | 'blocked_no_snippets';
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return uniqueStrings(value);
  if (typeof value !== 'string') return [];
  return uniqueStrings(value.split(/\s*\|\s*|\s*,\s*/));
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

function internetPipesFromRecord(record: unknown, source: string): PosInternetPipesCompleteness | null {
  if (!isRecord(record)) return null;
  const nested = isRecord(record.internet_pipes) ? record.internet_pipes : null;
  const score = asNumber(record.internet_pipes_score) ?? asNumber(record.score) ?? asNumber(nested?.score);
  const readiness = asString(record.internet_pipes_readiness) ?? asString(record.readiness) ?? asString(nested?.readiness);
  const missingStations = uniqueStrings([
    ...asStringArray(record.internet_pipes_missing_stations),
    ...asStringArray(record.missing_stations),
    ...asStringArray(record.missingStations),
    ...asStringArray(nested?.missing_stations),
    ...asStringArray(nested?.missingStations),
  ]);
  const recommendations = uniqueStrings([
    ...asStringArray(record.internet_pipes_recommendations),
    ...asStringArray(record.recommendations),
    ...asStringArray(nested?.recommendations),
  ]);
  if (score === null && !readiness && missingStations.length === 0 && recommendations.length === 0) {
    return null;
  }
  return {
    score,
    readiness,
    missing_stations: missingStations,
    recommendations,
    source,
  };
}

function resolveInternetPipesCompleteness(payload: JsonRecord, selectionSnapshot: JsonRecord | null): PosInternetPipesCompleteness {
  const payloadPaperclip = isRecord(payload.paperclip) ? payload.paperclip : null;
  const snapshotPaperclip = isRecord(selectionSnapshot?.paperclip) ? selectionSnapshot.paperclip : null;
  const frozenBundle = isRecord(selectionSnapshot?.frozen_bundle) ? selectionSnapshot.frozen_bundle : null;
  const evidence = isRecord(payload.evidence) ? payload.evidence : null;
  const candidates: Array<[unknown, string]> = [
    [frozenBundle?.launch_target, 'selection_snapshot.frozen_bundle.launch_target'],
    [frozenBundle?.business_choice, 'selection_snapshot.frozen_bundle.business_choice'],
    [frozenBundle?.execution_candidate, 'selection_snapshot.frozen_bundle.execution_candidate'],
    [frozenBundle?.research_target, 'selection_snapshot.frozen_bundle.research_target'],
    [selectionSnapshot?.launch_target, 'selection_snapshot.launch_target'],
    [selectionSnapshot?.business_choice, 'selection_snapshot.business_choice'],
    [selectionSnapshot?.execution_candidate, 'selection_snapshot.execution_candidate'],
    [selectionSnapshot?.research_target, 'selection_snapshot.research_target'],
    [selectionSnapshot?.selected_opportunity, 'selection_snapshot.selected_opportunity'],
    [payload.opportunity, 'payload.opportunity'],
    [payload.execution_candidate, 'payload.execution_candidate'],
    [payload.research_target, 'payload.research_target'],
    [payloadPaperclip?.dispatch_gate, 'payload.paperclip.dispatch_gate'],
    [snapshotPaperclip?.dispatch_gate, 'selection_snapshot.paperclip.dispatch_gate'],
    [evidence?.internet_pipes, 'payload.evidence.internet_pipes'],
  ];
  for (const [candidate, source] of candidates) {
    const resolved = internetPipesFromRecord(candidate, source);
    if (resolved) return resolved;
  }
  return {
    score: null,
    readiness: null,
    missing_stations: [],
    recommendations: [],
    source: null,
  };
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

function sha256Text(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sha256File(filePath: string): string {
  const digest = createHash('sha256');
  const handle = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(1024 * 1024);
  try {
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(handle, buffer, 0, buffer.length, null);
      if (bytesRead > 0) digest.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(handle);
  }
  return digest.digest('hex');
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
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

function queryFromInternetPipes(targetRepo: string | null, internetPipes: PosInternetPipesCompleteness): string[] {
  const repoTerm = targetRepo ? targetRepo.split('/').pop() : 'portfolio product';
  return uniqueStrings([
    ...internetPipes.missing_stations.flatMap((station) => [
      `"${repoTerm}" internet pipes ${station} evidence`,
      `${repoTerm} ${station} buyer proof market validation`,
    ]),
    ...internetPipes.recommendations.map((recommendation) => `${repoTerm} ${recommendation}`),
  ]);
}

function internetPipesStationGaps(internetPipes: PosInternetPipesCompleteness): string[] {
  return internetPipes.missing_stations.map((station) => `Internet Pipes station gap: ${station}`);
}

function internetPipesResearchQuestions(internetPipes: PosInternetPipesCompleteness): string[] {
  const stationQuestions = internetPipes.missing_stations.map((station) => (
    `What dated external proof resolves the Internet Pipes ${station} station gap?`
  ));
  const recommendationQuestions = internetPipes.recommendations.map((recommendation) => (
    `What source-backed evidence satisfies this Internet Pipes recommendation: ${recommendation}?`
  ));
  return uniqueStrings([...stationQuestions, ...recommendationQuestions]);
}

function internetPipesCheck(internetPipes: PosInternetPipesCompleteness): JsonRecord {
  if (!internetPipes.readiness) {
    return { id: 'internet-pipes-completeness', status: 'not_applicable' };
  }
  return {
    id: 'internet-pipes-completeness',
    status: isInternetPipesBlocked(internetPipes) ? 'blocked' : 'pass',
    score: internetPipes.score,
    readiness: internetPipes.readiness,
    missing_stations: internetPipes.missing_stations,
    recommendations: internetPipes.recommendations,
    source: internetPipes.source,
  };
}

function isInternetPipesBlocked(internetPipes: PosInternetPipesCompleteness): boolean {
  if (!internetPipes.readiness) return false;
  return !INTERNET_PIPES_DISPATCH_READY.has(internetPipes.readiness);
}

function collectRetrievalTerms(payload: JsonRecord, selectionSnapshot: JsonRecord | null): string[] {
  const targetRepo = resolveTargetRepoFullName(payload, selectionSnapshot);
  const internetPipes = resolveInternetPipesCompleteness(payload, selectionSnapshot);
  const terms = [
    targetRepo?.split('/').pop(),
    resolveMandateType(payload),
    'promptClass',
    'failure_recovery',
    'blocker',
    'receiptPath',
    'command',
    'exit code',
    ...resolveTasks(payload).flatMap((task) => [asString(task.id), asString(task.title), asString(task.type)]),
    ...uniqueStrings(resolveMissingEvidenceForArtifact(payload, selectionSnapshot)),
    internetPipes.readiness,
    ...internetPipes.missing_stations,
    ...internetPipes.recommendations,
    lookupNestedString(selectionSnapshot, 'launch_target', 'best_niche'),
    lookupNestedString(selectionSnapshot, 'launch_target', 'strongest_wedge'),
  ];
  return uniqueStrings(terms.filter((value): value is string => Boolean(value))).slice(0, 24);
}

function jsonSourceText(record: JsonRecord): string {
  return JSON.stringify(record, null, 2);
}

function fileFreshness(filePath: string): string {
  try {
    const ageHours = (Date.now() - fs.statSync(filePath).mtimeMs) / (1000 * 60 * 60);
    return ageHours <= 24 ? 'fresh' : 'stale';
  } catch {
    return 'unknown';
  }
}

function collectContextPackRefs(payload: JsonRecord): JsonRecord[] {
  const context = isRecord(payload.context) ? payload.context : null;
  const paperclip = isRecord(payload.paperclip) ? payload.paperclip : null;
  const ledger = isRecord(paperclip?.context_ledger) ? paperclip.context_ledger : null;
  const refs = [
    ...asArray(context?.packs).filter(isRecord),
    ...asArray(ledger?.context_pack_refs).filter(isRecord),
  ];
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = `${asString(ref.packPath) ?? ''}:${asString(ref.packSha) ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function candidateSourcePaths(payload: JsonRecord, artifactPath: string, workspaceRoot: string, runId: string): JsonRecord[] {
  const gstack = isRecord(payload.gstack) ? payload.gstack : null;
  const outputs = isRecord(payload.outputs) ? payload.outputs : null;
  const paperclip = isRecord(payload.paperclip) ? payload.paperclip : null;
  const ledger = isRecord(paperclip?.context_ledger) ? paperclip.context_ledger : null;
  const contextPackRefs = collectContextPackRefs(payload)
    .map((ref) => ({
      kind: 'context_pack',
      path: asString(ref.packPath),
      freshness: asString(ref.freshnessStatus) ?? 'unknown',
      declared_hash: asString(ref.packSha),
    }));
  const direct = [
    { kind: 'input_artifact', path: artifactPath },
    { kind: 'gstack_evidence', path: asString(gstack?.evidence_backfill_path) },
    { kind: 'gstack_qa', path: asString(gstack?.qa_verification_path) },
    { kind: 'gstack_patch_plan', path: asString(gstack?.patch_plan_path) },
    { kind: 'hermes_result', path: asString(outputs?.result_path) },
    { kind: 'hermes_execution_log', path: asString(outputs?.execution_log_path) },
    { kind: 'paperclip_run_ledger', path: asString(ledger?.run_ledger_path) ?? asString(ledger?.context_ledger_path) },
    { kind: 'paperclip_issue_ledger', path: asString(ledger?.issue_ledger_path) },
  ];
  const seen = new Set<string>();
  return [...direct, ...contextPackRefs]
    .filter((source) => pathExists(asString(source.path)))
    .filter((source) => {
      const sourcePath = asString(source.path) ?? '';
      if (seen.has(sourcePath)) return false;
      seen.add(sourcePath);
      return sourcePath !== path.resolve(artifactPath) || source.kind === 'input_artifact';
    })
    .map((source) => ({
      kind: String(source.kind),
      path: path.resolve(String(source.path)),
      freshness: asString(source.freshness) ?? fileFreshness(String(source.path)),
      declared_hash: asString(source.declared_hash),
    }));
}

function readBoundedSourceText(sourcePath: string): string {
  const maxBytes = 512 * 1024;
  const buffer = fs.readFileSync(sourcePath);
  const bounded = buffer.length > maxBytes
    ? Buffer.concat([buffer.subarray(0, maxBytes / 2), Buffer.from('\n\n[...bounded source omitted...]\n\n'), buffer.subarray(buffer.length - maxBytes / 2)])
    : buffer;
  return bounded.toString('utf-8');
}

function scoreLine(line: string, terms: string[]): number {
  const lower = line.toLowerCase();
  let score = 0;
  for (const term of terms) {
    const normalized = term.toLowerCase();
    if (normalized.length < 3) continue;
    if (lower.includes(normalized)) score += Math.min(5, Math.ceil(normalized.length / 8));
  }
  return score;
}

function boundedSnippet(lines: string[], index: number, maxChars: number): { text: string; lineStart: number; lineEnd: number } {
  const start = Math.max(0, index - 2);
  const end = Math.min(lines.length, index + 3);
  let text = lines.slice(start, end).join('\n').trim();
  if (text.length > maxChars) {
    const head = Math.floor((maxChars - 32) / 2);
    const tail = maxChars - 32 - head;
    text = `${text.slice(0, head).trimEnd()}\n[...snippet bounded...]\n${text.slice(-tail).trimStart()}`;
  }
  return { text, lineStart: start + 1, lineEnd: end };
}

function collectSnippetsFromSource(
  source: JsonRecord,
  terms: string[],
  maxCharsPerSnippet: number,
): PosRetrievalSnippet[] {
  const sourcePath = asString(source.path);
  if (!sourcePath) return [];
  const sourceText = readBoundedSourceText(sourcePath);
  const lines = sourceText.split(/\r?\n/);
  const sourceHash = sha256File(sourcePath);
  const candidates = lines
    .map((line, index) => ({ index, score: scoreLine(line, terms) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const selected: PosRetrievalSnippet[] = [];
  const occupied = new Set<number>();
  for (const candidate of candidates) {
    if (selected.length >= 4) break;
    if (occupied.has(candidate.index)) continue;
    const snippet = boundedSnippet(lines, candidate.index, maxCharsPerSnippet);
    for (let line = snippet.lineStart; line <= snippet.lineEnd; line += 1) occupied.add(line - 1);
    selected.push({
      source_path: sourcePath,
      source_kind: String(source.kind ?? 'unknown'),
      source_hash: sourceHash,
      snippet_hash: sha256Text(snippet.text),
      freshness: String(source.freshness ?? fileFreshness(sourcePath)),
      score: candidate.score,
      line_start: snippet.lineStart,
      line_end: snippet.lineEnd,
      text: snippet.text,
    });
  }
  if (selected.length === 0 && source.kind === 'input_artifact') {
    const snippet = boundedSnippet(lines, 0, maxCharsPerSnippet);
    selected.push({
      source_path: sourcePath,
      source_kind: String(source.kind),
      source_hash: sourceHash,
      snippet_hash: sha256Text(snippet.text),
      freshness: String(source.freshness ?? fileFreshness(sourcePath)),
      score: 1,
      line_start: snippet.lineStart,
      line_end: snippet.lineEnd,
      text: snippet.text,
    });
  }
  return selected;
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
    internet_pipes: resolveInternetPipesCompleteness(artifact.payload, artifact.selectionSnapshot),
  };
}

export function resolvePosEvidencePlan(artifactPath: string): PosEvidencePlan {
  const artifact = loadPosArtifact(artifactPath);
  const runId = resolveRunId(artifact.payload, artifact.selectionSnapshot);
  const workspaceRoot = resolveWorkspaceRoot(artifact.payload, artifact.artifactPath);
  const internetPipes = resolveInternetPipesCompleteness(artifact.payload, artifact.selectionSnapshot);
  return {
    input_kind: artifact.kind,
    input_path: artifact.artifactPath,
    run_id: runId,
    schema_version: asString(artifact.payload.schema_version),
    selection_snapshot_path: resolveSelectionSnapshotPath(artifact.payload, artifact.artifactPath, artifact.kind),
    missing_evidence: resolveMissingEvidenceForArtifact(artifact.payload, artifact.selectionSnapshot),
    station_gaps: internetPipesStationGaps(internetPipes),
    internet_pipes: internetPipes,
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
  const internetPipes = resolveInternetPipesCompleteness(artifact.payload, artifact.selectionSnapshot);
  const questions = [
    ...uniqueStrings(missingEvidence).map((item) => `What dated external proof resolves this gap: ${item}?`),
    ...internetPipesResearchQuestions(internetPipes),
  ];
  return {
    schema_version: 'gstack.pos_evidence_backfill.v1',
    generated_at: nowIso(),
    input_kind: artifact.kind,
    input_path: artifact.artifactPath,
    run_id: runId,
    target_repo_full_name: targetRepo,
    missing_evidence: missingEvidence,
    station_gaps: internetPipesStationGaps(internetPipes),
    internet_pipes: internetPipes,
    research_questions: questions,
    suggested_queries: uniqueStrings([
      ...queryFromMissingEvidence(targetRepo, missingEvidence),
      ...queryFromInternetPipes(targetRepo, internetPipes),
    ]),
    evidence_write_back_path: path.join(workspaceRoot, 'portfolio-os', 'inputs', 'market_signals', 'latest.csv'),
    status: missingEvidence.length > 0 || internetPipes.missing_stations.length > 0 ? 'ready_for_research' : 'blocked_no_missing_evidence',
  };
}

export function resolvePosQaVerificationArtifact(artifactPath: string): PosQaVerificationArtifact {
  const plan = resolvePosQaPlan(artifactPath);
  const hasSurface = pathExists(plan.target_repo_clone_path) || plan.local_html_candidates.length > 0;
  const internetPipesBlocked = isInternetPipesBlocked(plan.internet_pipes);
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
    internet_pipes: plan.internet_pipes,
    checks: [
      { id: 'target-repo-present', status: pathExists(plan.target_repo_clone_path) ? 'pass' : 'blocked' },
      { id: 'local-html-candidates', status: plan.local_html_candidates.length > 0 ? 'pass' : 'not_applicable', count: plan.local_html_candidates.length },
      { id: 'qa-report-path-ready', status: 'ready', path: plan.qa_report_path },
      internetPipesCheck(plan.internet_pipes),
    ],
    status: hasSurface
      ? (internetPipesBlocked ? 'blocked_internet_pipes_completeness' : 'ready_for_qa')
      : 'blocked_no_target_surface',
  };
}

export function resolvePosPatchPlanArtifact(artifactPath: string): PosPatchPlanArtifact {
  const artifact = loadPosArtifact(artifactPath);
  const runId = resolveRunId(artifact.payload, artifact.selectionSnapshot);
  const tasks = resolveTasks(artifact.payload);
  const filesExpected = collectExpectedFiles(tasks);
  const internetPipes = resolveInternetPipesCompleteness(artifact.payload, artifact.selectionSnapshot);
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
    internet_pipes: internetPipes,
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

export function resolvePosRetrievalContextArtifact(artifactPath: string): PosRetrievalContextArtifact {
  const artifact = loadPosArtifact(artifactPath);
  const runId = resolveRunId(artifact.payload, artifact.selectionSnapshot);
  const workspaceRoot = resolveWorkspaceRoot(artifact.payload, artifact.artifactPath);
  const maxSnippets = 8;
  const maxCharsPerSnippet = 700;
  const maxTotalChars = 6000;
  const queryTerms = collectRetrievalTerms(artifact.payload, artifact.selectionSnapshot);
  const sources = candidateSourcePaths(artifact.payload, artifact.artifactPath, workspaceRoot, runId);
  const sourcesConsidered = sources.map((source) => {
    const sourcePath = asString(source.path);
    return {
      kind: source.kind,
      path: sourcePath,
      hash: sourcePath && fs.existsSync(sourcePath) ? sha256File(sourcePath) : '',
      declared_hash: source.declared_hash,
      freshness: source.freshness,
    };
  });
  const ranked = sources
    .flatMap((source) => collectSnippetsFromSource(source, queryTerms, maxCharsPerSnippet))
    .sort((left, right) => right.score - left.score || left.source_path.localeCompare(right.source_path));
  const snippets: PosRetrievalSnippet[] = [];
  let totalChars = 0;
  for (const snippet of ranked) {
    if (snippets.length >= maxSnippets) break;
    if (totalChars + snippet.text.length > maxTotalChars && snippets.length > 0) continue;
    snippets.push(snippet);
    totalChars += snippet.text.length;
  }
  return {
    schema_version: 'gstack.pos_retrieval_context.v1',
    generated_at: nowIso(),
    input_kind: artifact.kind,
    input_path: artifact.artifactPath,
    run_id: runId,
    target_repo_full_name: resolveTargetRepoFullName(artifact.payload, artifact.selectionSnapshot),
    internet_pipes: resolveInternetPipesCompleteness(artifact.payload, artifact.selectionSnapshot),
    budget: {
      max_snippets: maxSnippets,
      max_chars_per_snippet: maxCharsPerSnippet,
      max_total_chars: maxTotalChars,
      estimated_tokens: estimateTokens(snippets.map((snippet) => snippet.text).join('\n\n')),
    },
    policy: {
      raw_vectors_included: false,
      hermes_system_prompt_mutated: false,
      pointer_only_context_allowed: false,
    },
    query_terms: queryTerms,
    snippets,
    sources_considered: sourcesConsidered,
    status: sources.length === 0 ? 'blocked_no_sources' : snippets.length > 0 ? 'ready' : 'blocked_no_snippets',
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

export function writePosRetrievalContextArtifact(artifactPath: string, outputPath?: string): string {
  const artifact = loadPosArtifact(artifactPath);
  const runId = resolveRunId(artifact.payload, artifact.selectionSnapshot);
  const workspaceRoot = resolveWorkspaceRoot(artifact.payload, artifact.artifactPath);
  const out = outputPath ?? resolveGstackOutputPath(artifact.payload, workspaceRoot, runId, 'retrieval_context_path', 'retrieval_context');
  return writeJsonFile(out, resolvePosRetrievalContextArtifact(artifactPath) as unknown as JsonRecord);
}
