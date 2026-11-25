import { ValidationError, analyse } from '@voltwise/engine';

export const ENGINE_VERSION = 'voltwise-engine@2.0.0';

/** Compute the full analysed report and add the metadata clients show next to it. */
export function buildReport({ loads = [], settings = {} } = {}) {
  if (!Array.isArray(loads)) throw new ValidationError('loads must be an array');
  const report = analyse({ loads, settings });
  return {
    ...report,
    meta: {
      engine: ENGINE_VERSION,
      generatedAt: new Date().toISOString(),
      loadCount: report.breakdown.length,
    },
  };
}

/** Small summary kept with each revision and on project cards. */
export function reportDigest(report) {
  if (!report) return null;
  return {
    connectedKw: report.summary?.connectedKw ?? 0,
    maxDemandKva: report.summary?.maxDemandKva ?? 0,
    overallPf: report.summary?.overallPf ?? 1,
    feederA: report.feeder?.current ?? 0,
    cable: report.cable ? `${report.cable.runs > 1 ? `${report.cable.runs}× ` : ''}${report.cable.sizeSqmm} mm² ${report.cable.conductor === 'al' ? 'Al' : 'Cu'}` : null,
    transformerKva: report.transformer?.kva ?? null,
    warnings: report.warnings?.length ?? 0,
  };
}
