/**
 * Schema drift detection: checks if command output fields are suspiciously empty,
 * indicating upstream API structure changes.
 */

import chalk from 'chalk';

/** A single field's drift measurement */
export interface DriftField {
  field: string;
  emptyCount: number;
  totalRows: number;
  emptyRate: number;
}

/** Overall drift detection result */
export interface DriftReport {
  hasDrift: boolean;
  fields: DriftField[];
}

/**
 * Detect schema drift by checking empty-value ratio per column.
 * "Empty" = null, undefined, or ''. Numeric 0 and false are valid values.
 * Non-object rows are skipped. Returns hasDrift: false if valid rows < 3.
 * Trigger: emptyRate >= threshold (inclusive).
 */
export function detectDrift(
  rows: unknown[],
  columns: string[],
  threshold: number = 0.8
): DriftReport {
  if (!columns.length) return { hasDrift: false, fields: [] };

  // Filter to valid object rows
  const objectRows = rows.filter(
    (r): r is Record<string, unknown> => typeof r === 'object' && r !== null && !Array.isArray(r)
  );
  if (objectRows.length < 3) return { hasDrift: false, fields: [] };

  const totalRows = objectRows.length;
  const driftFields: DriftField[] = [];

  for (const col of columns) {
    let emptyCount = 0;
    for (const row of objectRows) {
      const v = row[col];
      if (v === null || v === undefined || v === '') emptyCount++;
    }
    const emptyRate = emptyCount / totalRows;
    if (emptyRate >= threshold) {
      driftFields.push({ field: col, emptyCount, totalRows, emptyRate });
    }
  }

  return { hasDrift: driftFields.length > 0, fields: driftFields };
}

/**
 * Format drift report as human-readable stderr warning.
 * Wrapped in chalk.yellow. No trailing newline (console.error adds it).
 */
export function formatDriftWarning(report: DriftReport, commandName: string): string {
  const lines = [chalk.yellow(`\u26a0 Schema drift detected (${commandName}):`)];
  for (const f of report.fields) {
    const pct = Math.round(f.emptyRate * 100);
    lines.push(chalk.yellow(`  \u2022 field '${f.field}' \u2014 empty in ${f.emptyCount}/${f.totalRows} rows (${pct}%)`));
  }
  return lines.join('\n');
}
