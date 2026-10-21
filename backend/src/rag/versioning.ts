import type { LegalMetadata } from './types.js';

function parseIsoDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isApplicableOn(metadata: LegalMetadata, asOf = new Date()) {
  if (metadata.isCurrent === false) return false;
  const effectiveFrom = parseIsoDate(metadata.effectiveFrom);
  const effectiveTo = parseIsoDate(metadata.effectiveTo);
  if (effectiveFrom && effectiveFrom.getTime() > asOf.getTime()) return false;
  if (effectiveTo && effectiveTo.getTime() < asOf.getTime()) return false;
  return true;
}

export function versionPreferenceScore(metadata: LegalMetadata, preferCurrent: boolean, asOf = new Date()) {
  if (!preferCurrent) return 0.5;
  if (metadata.isCurrent === true) return isApplicableOn(metadata, asOf) ? 1 : 0;
  if (metadata.isCurrent === false) return 0;
  return isApplicableOn(metadata, asOf) ? 0.75 : 0;
}
