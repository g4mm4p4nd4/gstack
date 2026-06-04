#!/usr/bin/env bun

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

function usage() {
  console.error('Usage: bun run scripts/pos-artifact.ts <qa-plan|qa-field|evidence-plan|evidence-field|evidence-hunt|build-qa|patch-plan|retrieval-context> <artifact.json> [field]');
  console.error('       bun run scripts/pos-artifact.ts <evidence-hunt|build-qa|patch-plan|retrieval-context> --bundle <bundle.json> [--output <artifact.json>]');
  process.exit(1);
}

function printField(plan: Record<string, unknown>, field: string) {
  if (!(field in plan)) {
    console.error(`Unknown field: ${field}`);
    process.exit(1);
  }
  const value = plan[field];
  if (value === null || value === undefined) return;
  if (Array.isArray(value) || typeof value === 'object') {
    console.log(JSON.stringify(value));
    return;
  }
  console.log(String(value));
}

function parseArtifactArgs(args: string[]): { artifactPath: string; outputPath?: string; field?: string } {
  if (args[0] && !args[0].startsWith('--')) {
    return { artifactPath: args[0], field: args[1] };
  }
  const bundleIndex = args.indexOf('--bundle');
  const artifactIndex = args.indexOf('--artifact');
  const outputIndex = args.indexOf('--output');
  const artifactPath = bundleIndex >= 0 ? args[bundleIndex + 1] : artifactIndex >= 0 ? args[artifactIndex + 1] : '';
  const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : undefined;
  return { artifactPath, outputPath };
}

const [mode, ...rest] = process.argv.slice(2);
const { artifactPath, outputPath, field } = parseArtifactArgs(rest);
if (!mode || !artifactPath) usage();

if (mode === 'qa-plan') {
  console.log(JSON.stringify(resolvePosQaPlan(artifactPath), null, 2));
} else if (mode === 'qa-field') {
  if (!field) usage();
  printField(resolvePosQaPlan(artifactPath) as Record<string, unknown>, field);
} else if (mode === 'evidence-plan') {
  console.log(JSON.stringify(resolvePosEvidencePlan(artifactPath), null, 2));
} else if (mode === 'evidence-field') {
  if (!field) usage();
  printField(resolvePosEvidencePlan(artifactPath) as Record<string, unknown>, field);
} else if (mode === 'evidence-hunt') {
  const path = writePosEvidenceBackfillArtifact(artifactPath, outputPath);
  console.log(JSON.stringify({ artifact_path: path, artifact: resolvePosEvidenceBackfillArtifact(artifactPath) }, null, 2));
} else if (mode === 'build-qa') {
  const path = writePosQaVerificationArtifact(artifactPath, outputPath);
  console.log(JSON.stringify({ artifact_path: path, artifact: resolvePosQaVerificationArtifact(artifactPath) }, null, 2));
} else if (mode === 'patch-plan') {
  const path = writePosPatchPlanArtifact(artifactPath, outputPath);
  console.log(JSON.stringify({ artifact_path: path, artifact: resolvePosPatchPlanArtifact(artifactPath) }, null, 2));
} else if (mode === 'retrieval-context') {
  const path = writePosRetrievalContextArtifact(artifactPath, outputPath);
  console.log(JSON.stringify({ artifact_path: path, artifact: resolvePosRetrievalContextArtifact(artifactPath) }, null, 2));
} else {
  usage();
}
