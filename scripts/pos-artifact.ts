#!/usr/bin/env bun

import { resolvePosEvidencePlan, resolvePosQaPlan } from '../lib/pos-artifacts';

function usage() {
  console.error('Usage: bun run scripts/pos-artifact.ts <qa-plan|qa-field|evidence-plan|evidence-field> <artifact.json> [field]');
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

const [mode, artifactPath, field] = process.argv.slice(2);
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
} else {
  usage();
}
