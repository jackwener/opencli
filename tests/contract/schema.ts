/** Schema for a single field */
export interface FieldSchema {
  types: string[];
  presentRate: number;
}

/** Schema snapshot for one command */
export interface CommandSchema {
  command: string;
  timestamp: string;
  rowCount: number;
  fields: Record<string, FieldSchema>;
}

/**
 * Resolve the type of a value for schema purposes.
 * Distinguishes arrays from plain objects (both return "object" from typeof).
 */
function resolveType(val: unknown): string {
  if (Array.isArray(val)) return 'array';
  return typeof val;
}

/**
 * Extract schema from command output rows.
 * Skips non-object rows. Records all observed types per field
 * and the proportion of rows where the field has a non-empty value.
 */
export function extractSchema(rows: unknown[], command: string): CommandSchema {
  const objectRows = rows.filter(
    (r): r is Record<string, unknown> => typeof r === 'object' && r !== null && !Array.isArray(r),
  );

  const fieldMap = new Map<string, { typeSet: Set<string>; presentCount: number }>();

  for (const row of objectRows) {
    for (const [key, val] of Object.entries(row)) {
      if (!fieldMap.has(key)) {
        fieldMap.set(key, { typeSet: new Set(), presentCount: 0 });
      }
      const entry = fieldMap.get(key)!;
      const isPresent = val !== null && val !== undefined && val !== '';
      if (isPresent) {
        entry.presentCount++;
        entry.typeSet.add(resolveType(val));
      }
    }
  }

  const rowCount = objectRows.length;
  const fields: Record<string, FieldSchema> = {};
  for (const [key, entry] of fieldMap) {
    fields[key] = {
      types: [...entry.typeSet].sort(),
      presentRate: rowCount > 0 ? Math.round((entry.presentCount / rowCount) * 100) / 100 : 0,
    };
  }

  return {
    command,
    timestamp: new Date().toISOString(),
    rowCount,
    fields,
  };
}

/** A single detected schema change */
export interface SchemaDiff {
  type: 'field_added' | 'field_removed' | 'type_changed' | 'presence_dropped';
  field: string;
  detail: string;
  from?: string;
  to?: string;
}

/** Minimum row count required on both sides for presence_dropped detection */
const MIN_ROWS_FOR_PRESENCE = 5;
/** Minimum presentRate drop to trigger presence_dropped */
const PRESENCE_DROP_THRESHOLD = 0.3;

/**
 * Compare two schemas and return a list of structural differences.
 * presence_dropped requires both sides to have >= MIN_ROWS_FOR_PRESENCE rows.
 */
export function diffSchemas(prev: CommandSchema, curr: CommandSchema): SchemaDiff[] {
  const diffs: SchemaDiff[] = [];
  const prevFields = new Set(Object.keys(prev.fields));
  const currFields = new Set(Object.keys(curr.fields));

  // field_removed: in prev but not in curr
  for (const field of prevFields) {
    if (!currFields.has(field)) {
      diffs.push({ type: 'field_removed', field, detail: 'missing from response' });
    }
  }

  // field_added: in curr but not in prev
  for (const field of currFields) {
    if (!prevFields.has(field)) {
      const typesStr = curr.fields[field].types.join(', ') || 'unknown';
      diffs.push({ type: 'field_added', field, detail: `(${typesStr})` });
    }
  }

  // type_changed + presence_dropped: fields present in both
  for (const field of prevFields) {
    if (!currFields.has(field)) continue;
    const pf = prev.fields[field];
    const cf = curr.fields[field];

    // type_changed: only compare when both sides have actual types
    // (empty types set means all values were absent — that's a presence issue, not a type issue)
    const prevTypes = pf.types.join(',');
    const currTypes = cf.types.join(',');
    if (prevTypes !== currTypes && prevTypes.length > 0 && currTypes.length > 0) {
      diffs.push({
        type: 'type_changed',
        field,
        detail: `${prevTypes} -> ${currTypes}`,
        from: prevTypes,
        to: currTypes,
      });
    }

    // presence_dropped: both sides must have enough rows
    if (prev.rowCount >= MIN_ROWS_FOR_PRESENCE && curr.rowCount >= MIN_ROWS_FOR_PRESENCE) {
      const drop = pf.presentRate - cf.presentRate;
      if (drop > PRESENCE_DROP_THRESHOLD) {
        const pctPrev = Math.round(pf.presentRate * 100);
        const pctCurr = Math.round(cf.presentRate * 100);
        diffs.push({
          type: 'presence_dropped',
          field,
          detail: `${pctPrev}% -> ${pctCurr}% present`,
          from: `${pctPrev}%`,
          to: `${pctCurr}%`,
        });
      }
    }
  }

  return diffs;
}

/** 单条命令检测结果 */
export interface ContractResult {
  command: string;
  status: 'passed' | 'drifted' | 'failed';
  diffs?: SchemaDiff[];
  error?: string;
  consecutiveFailures?: number;
}

/** 完整的漂移报告（写入 JSON 文件） */
export interface DriftReport {
  timestamp: string;
  summary: { total: number; passed: number; drifted: number; failed: number };
  results: ContractResult[];
}

/** Commands failing for this many consecutive days are marked as degraded */
const DEGRADED_THRESHOLD = 7;

/**
 * Format contract check results as human-readable console output.
 * No ANSI colors — CI logs render plain text fine.
 */
export function formatReport(results: ContractResult[], now?: Date): string {
  const lines: string[] = [];
  const date = (now ?? new Date()).toISOString().slice(0, 10);
  lines.push(`Schema Contract Check -- ${date}`);
  lines.push('');

  for (const r of results) {
    if (r.status === 'passed') {
      lines.push(`  ✓ ${r.command.padEnd(24)} -- no drift`);
    } else if (r.status === 'drifted') {
      const diffs = r.diffs ?? [];
      lines.push(`  ✗ ${r.command.padEnd(24)} -- ${diffs.length} drift(s) detected`);
      for (const d of diffs) {
        // Prefix symbol per diff type
        const prefix = d.type === 'field_added' ? '+' :
                       d.type === 'field_removed' ? '-' :
                       d.type === 'type_changed' ? '~' : '↓';
        lines.push(`      ${prefix} field '${d.field}' -- ${d.detail}`);
      }
    } else {
      const degraded = (r.consecutiveFailures ?? 0) >= DEGRADED_THRESHOLD;
      const suffix = degraded
        ? ` (${r.consecutiveFailures} consecutive, degraded)`
        : '';
      lines.push(`  ⚠ ${r.command.padEnd(24)} -- command failed${suffix}`);
    }
  }

  const passed = results.filter(r => r.status === 'passed').length;
  const drifted = results.filter(r => r.status === 'drifted').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const degradedCount = results.filter(
    r => r.status === 'failed' && (r.consecutiveFailures ?? 0) >= DEGRADED_THRESHOLD,
  ).length;
  const degradedSuffix = degradedCount > 0 ? ` (${degradedCount} degraded)` : '';

  lines.push('');
  lines.push(`Summary: ${passed} passed, ${drifted} drifted, ${failed} failed${degradedSuffix}`);

  return lines.join('\n');
}

/**
 * Build the full JSON drift report from results.
 */
export function buildReport(results: ContractResult[], now?: Date): DriftReport {
  return {
    timestamp: (now ?? new Date()).toISOString(),
    summary: {
      total: results.length,
      passed: results.filter(r => r.status === 'passed').length,
      drifted: results.filter(r => r.status === 'drifted').length,
      failed: results.filter(r => r.status === 'failed').length,
    },
    results,
  };
}
