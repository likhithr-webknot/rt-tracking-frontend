// @ts-nocheck
import {
  addBand,
  addStream,
  deleteBand,
  deleteStream,
  resolveBandNumericId,
  fetchBands,
  fetchStreams,
  updateStream,
} from "./band-stream-directory";
import { STANDARD_BAND_CODES, STANDARD_DEPARTMENTS } from "../utils/directoryCatalog";

async function fetchAllBands() {
  const rows = [];
  let cursor = null;
  for (let i = 0; i < 50; i += 1) {
    const page = await fetchBands({ limit: 100, cursor });
    const items = Array.isArray(page?.items) ? page.items : [];
    rows.push(...items);
    if (!page?.nextCursor) break;
    cursor = page.nextCursor;
  }
  return rows;
}

async function fetchAllStreams() {
  const rows = [];
  let cursor = null;
  for (let i = 0; i < 50; i += 1) {
    const page = await fetchStreams({ limit: 100, cursor, activeOnly: null });
    const items = Array.isArray(page?.items) ? page.items : [];
    rows.push(...items);
    if (!page?.nextCursor) break;
    cursor = page.nextCursor;
  }
  return rows;
}

function bandCodeOf(row) {
  return String(row?.code ?? row?.label ?? "")
    .trim()
    .toUpperCase()
    .split(/\s*-\s*/)[0];
}

function deptNameOf(row) {
  return String(row?.code ?? row?.label ?? "").trim();
}

/**
 * Replace bands & departments with the canonical CSV catalogs.
 * Bands not in the list are deleted when unused; missing bands are created.
 * Departments not in the list are removed when unused; missing ones are added.
 */
export async function syncStandardBandsAndDepartments({ signal } = {}) {
  const standardBands = new Set(STANDARD_BAND_CODES.map((c) => c.toUpperCase()));
  const standardDepts = new Set(STANDARD_DEPARTMENTS.map((d) => d.toLowerCase()));

  const [bands, streams] = await Promise.all([fetchAllBands(), fetchAllStreams()]);

  const bandReport = { removed: 0, added: 0, kept: 0, errors: [] };
  const deptReport = { removed: 0, added: 0, reactivated: 0, kept: 0, errors: [] };

  const existingBandCodes = new Set();

  for (const row of bands) {
    const code = bandCodeOf(row);
    if (!code) continue;
    existingBandCodes.add(code);
    if (standardBands.has(code)) {
      bandReport.kept += 1;
      continue;
    }
    try {
      const direct = String(row?.id ?? "").trim();
      const bandId = /^\d+$/.test(direct)
        ? direct
        : await resolveBandNumericId(row, { signal });
      await deleteBand(bandId, { signal });
      bandReport.removed += 1;
    } catch (err) {
      bandReport.errors.push(`Band ${code}: ${err?.message || "remove failed"}`);
    }
  }

  for (const code of STANDARD_BAND_CODES) {
    if (existingBandCodes.has(code)) continue;
    try {
      await addBand(
        {
          code,
          name: code,
          designation: code,
          label: code,
          bandType: "BOTH",
        },
        { signal },
      );
      bandReport.added += 1;
    } catch (err) {
      bandReport.errors.push(`Add band ${code}: ${err?.message || "failed"}`);
    }
  }

  const streamByName = new Map();
  for (const row of streams) {
    const name = deptNameOf(row);
    if (!name) continue;
    streamByName.set(name.toLowerCase(), row);
  }

  for (const row of streams) {
    const name = deptNameOf(row);
    const key = name.toLowerCase();
    if (!name || standardDepts.has(key)) {
      if (standardDepts.has(key)) deptReport.kept += 1;
      continue;
    }
    try {
      await deleteStream(row, { signal });
      deptReport.removed += 1;
    } catch (err) {
      deptReport.errors.push(`Department ${name}: ${err?.message || "remove failed"}`);
    }
  }

  for (const dept of STANDARD_DEPARTMENTS) {
    const key = dept.toLowerCase();
    const existing = streamByName.get(key);
    if (!existing) {
      try {
        await addStream({ name: dept, code: dept, label: dept, active: true }, { signal });
        deptReport.added += 1;
      } catch (err) {
        deptReport.errors.push(`Add ${dept}: ${err?.message || "failed"}`);
      }
      continue;
    }
    if (!existing.active) {
      try {
        await updateStream(existing, { id: existing.id, active: true, listed: true }, { signal });
        deptReport.reactivated += 1;
      } catch (err) {
        deptReport.errors.push(`Activate ${dept}: ${err?.message || "failed"}`);
      }
    }
  }

  return { bands: bandReport, departments: deptReport };
}
