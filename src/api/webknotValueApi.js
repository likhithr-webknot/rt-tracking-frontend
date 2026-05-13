import { getAuthHeader } from "./auth.js";
import { buildApiUrl, parseResponse, toHttpError, withCsrfHeaders } from "./http.js";

function toCleanString(value, depth = 0) {
    if (value == null) return "";
    if (depth > 3) return "";
    if (Array.isArray(value)) {
        return value
            .map((v) => toCleanString(v, depth + 1))
            .filter(Boolean)
            .join(", ");
    }
    const t = typeof value;
    if (t === "string") return value.trim();
    if (t === "number" || t === "boolean" || t === "bigint") return String(value);
    if (t === "object") {
        const obj = value;
        const candidates = [
            obj?.title,
            obj?.name,
            obj?.label,
            obj?.value,
            obj?.text,
            obj?.code,
            obj?.id,
        ];
        for (const c of candidates) {
            const s = toCleanString(c, depth + 1);
            if (s) return s;
        }
        return "";
    }

    return "";
}

function pickDeep(obj, keys, depth = 0) {
    if (!obj || typeof obj !== "object") return "";
    if (depth > 3) return "";
    const keyList = Array.isArray(keys) ? keys : [];
    const actualKeys = Object.keys(obj);
    const lowerToActual = new Map(actualKeys.map((k) => [k.toLowerCase(), k]));
    for (const k of keyList) {
        const direct = obj[k];
        const s1 = toCleanString(direct, depth + 1);
        if (s1) return s1;

        const mapped = lowerToActual.get(String(k).toLowerCase());
        if (mapped && mapped !== k) {
            const s2 = toCleanString(obj[mapped], depth + 1);
            if (s2) return s2;
        }
    }
    for (const v of Object.values(obj)) {
        if (!v || typeof v !== "object") continue;
        const s = pickDeep(v, keyList, depth + 1);
        if (s) return s;
    }
    return "";
}

function buildWebknotValueUrl(path) {
    return buildApiUrl(path);
}

function makeFallbackId(title, index) {
    const base = toCleanString(title).toLowerCase();
    const slug = base
        ? base
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 80)
        : "";
    return slug || `value_${index}`;
}

export function normalizeWebknotValue(raw, index = 0) {
    const obj = raw && typeof raw === "object" ? raw : {};
    const title =
        pickDeep(obj, ["title", "valueTitle", "valueName", "name", "value", "label"]) || "";

    const pillar =
        pickDeep(obj, [
            "evaluationCriteria",
            "evaluation_criteria",
            "evaluationcriteria",
            "criteria",
            "pillar",
            "valuePillar",
            "valuePillarName",
            "pillarName",
            "pillarType",
            "category",
            "group",
            "domain",
        ]) || "";

    const description =
        pickDeep(obj, ["description", "valueDescription", "desc", "details", "definition"]) || "";

    const id =
        pickDeep(obj, ["id", "valueId", "webknotValueId", "code", "key"]) ||
        makeFallbackId(title, index);

    return {
        id,
        title: title || id,
        pillar: pillar || "—",
        description,
        raw: obj,
    };
}

export function normalizeWebknotValuesList(data) {
    const arr = Array.isArray(data)
        ? data
        : Array.isArray(data?.data)
            ? data.data
            : Array.isArray(data?.items)
                ? data.items
                : Array.isArray(data?.results)
                    ? data.results
                    : [];
    const out = [];
    const seen = new Set();
    for (let i = 0; i < arr.length; i++) {
        const raw = arr[i] && typeof arr[i] === "object" ? arr[i] : {};
        const active = !(raw.active === false || raw.isActive === false || raw.deleted === true || raw.isDeleted === true || String(raw.status || "").toLowerCase() === "inactive");
        if (!active) continue;
        const v = normalizeWebknotValue(raw, i);
        const key = String(v.id);
        if (!key) continue;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(v);
    }
    return out;
}

export async function fetchValues(activeOnly = true, { limit = null, cursor = null, offset = null, signal } = {}) {
    const auth = getAuthHeader();

    // This backend controller paginates using `limit` + `offset`.
    // Our UI code historically passes `cursor`, so we treat `cursor` as an offset.
    const resolvedOffset =
        offset != null ? Number.parseInt(String(offset), 10) :
        cursor != null ? Number.parseInt(String(cursor), 10) :
        0;
    const safeLimit = limit != null ? Number.parseInt(String(limit), 10) : 200;
    const safeOffset = Number.isFinite(resolvedOffset) && resolvedOffset >= 0 ? resolvedOffset : 0;

    const qs = new URLSearchParams();
    qs.set("activeOnly", String(activeOnly));
    if (Number.isFinite(safeLimit)) qs.set("limit", String(safeLimit));
    if (Number.isFinite(safeLimit)) qs.set("offset", String(safeOffset));
    // Compatibility: some older endpoints may accept `cursor` instead of `offset`.
    if (Number.isFinite(safeLimit)) qs.set("cursor", String(safeOffset));
    qs.set("_ts", Date.now().toString()); // cache-buster

    const endpoints = [
        `/api/v1/webknot-value/list?${qs.toString()}`,
        `/api/v1/webknot-values/list?${qs.toString()}`,
        `/api/v1/webknot-values?${qs.toString()}`,
    ];

    let lastRouteErr = null;
    for (const endpoint of endpoints) {
        const res = await fetch(buildWebknotValueUrl(endpoint), {
            signal,
            credentials: "include",
            cache: "no-store",
            headers: {
                ...(auth ? { Authorization: auth } : {}),
                "Cache-Control": "no-store, no-cache, must-revalidate",
                Pragma: "no-cache",
            },
        });
        if (!res.ok) {
            const err = await toHttpError(res);
            if (res.status === 404 || res.status === 405) {
                lastRouteErr = err;
                continue;
            }
            throw err;
        }

        const raw = await res.json().catch(() => ({}));
        const root = raw && typeof raw === "object" ? raw : {};
        const nested = root?.data && typeof root.data === "object" ? root.data : null;

        const items =
            (Array.isArray(root?.items) && root.items) ||
            (Array.isArray(root?.results) && root.results) ||
            (Array.isArray(root?.content) && root.content) ||
            (Array.isArray(root?.list) && root.list) ||
            (Array.isArray(nested?.data) && nested.data) ||
            (Array.isArray(nested?.items) && nested.items) ||
            (Array.isArray(nested?.results) && nested.results) ||
            (Array.isArray(nested?.content) && nested.content) ||
            (Array.isArray(nested?.list) && nested.list) ||
            (Array.isArray(nested?.values) && nested.values) ||
            [];

        const totalElement =
            (Number.isFinite(root?.totalElement) ? root.totalElement : null) ??
            (Number.isFinite(nested?.totalElement) ? nested.totalElement : null) ??
            (Number.isFinite(root?.totalElements) ? root.totalElements : null) ??
            (Number.isFinite(nested?.totalElements) ? nested.totalElements : null) ??
            null;

        const pageSize =
            (Number.isFinite(nested?.pageSize) ? nested.pageSize : null) ??
            (Number.isFinite(nested?.size) ? nested.size : null) ??
            safeLimit ??
            null;

        // Generate a next "cursor" compatible with existing pagination loops.
        const nextCursor =
            totalElement != null && pageSize != null && Number.isFinite(totalElement) && Number.isFinite(pageSize)
                ? (safeOffset + items.length < totalElement ? String(safeOffset + items.length) : null)
                : (items.length > 0 && safeLimit != null && items.length === safeLimit ? String(safeOffset + items.length) : null);

        return { items, nextCursor };
    }

    throw lastRouteErr || new Error("Webknot values list endpoint not found.");
}

export async function addValue(data) {
    const auth = getAuthHeader();
    const title = toCleanString(data?.title);
    const pillar = toCleanString(data?.pillar);
    const description = toCleanString(data?.description);
    const payload = {
        ...(data && typeof data === "object" ? data : {}),
        title,
        valueTitle: title,
        name: title,
        valueName: title,
        pillar,
        evaluation_criteria: pillar,
        evaluationCriteria: pillar,
        criteria: pillar,
        valuePillar: pillar,
        valuePillarName: pillar,
        pillarName: pillar,
        description,
        valueDescription: description,
        details: description,
        desc: description,
    };
    const headers = withCsrfHeaders({
        "Content-Type": "application/json",
        ...(auth ? { Authorization: auth } : {}),
    });
    const endpoints = ["/api/v1/webknot-value/add", "/api/v1/webknot-value"];
    let lastRouteErr = null;

    for (const endpoint of endpoints) {
        const res = await fetch(buildWebknotValueUrl(endpoint), {
            method: "POST",
            credentials: "include",
            headers,
            body: JSON.stringify(payload),
        });
        if (res.ok) return parseResponse(res, {});
        const err = await toHttpError(res);
        if (res.status === 404 || res.status === 405) {
            lastRouteErr = err;
            continue;
        }
        throw err;
    }

    throw lastRouteErr || new Error("Webknot value add endpoint not found.");
}

export async function updateValue(id, data) {
    const safeId = encodeURIComponent(String(id ?? "").trim());
    if (!safeId) throw new Error("Value id is required.");
    const auth = getAuthHeader();
    const title = toCleanString(data?.title);
    const pillar = toCleanString(data?.pillar);
    const description = toCleanString(data?.description);
    const payload = {
        ...(data && typeof data === "object" ? data : {}),
        id: String(id ?? "").trim(),
        valueId: String(id ?? "").trim(),
        webknotValueId: String(id ?? "").trim(),
        title,
        valueTitle: title,
        name: title,
        valueName: title,
        pillar,
        evaluation_criteria: pillar,
        evaluationCriteria: pillar,
        criteria: pillar,
        valuePillar: pillar,
        valuePillarName: pillar,
        pillarName: pillar,
        description,
        valueDescription: description,
        details: description,
        desc: description,
    };
    const headers = withCsrfHeaders({
        "Content-Type": "application/json",
        ...(auth ? { Authorization: auth } : {}),
    });
    const endpoints = [
        { method: "PUT", path: `/api/v1/webknot-value/${safeId}` },
        { method: "PATCH", path: `/api/v1/webknot-value/${safeId}` },
        { method: "POST", path: `/api/v1/webknot-value/${safeId}` },
        { method: "PUT", path: `/api/v1/webknot-value/update/${safeId}` },
        { method: "PATCH", path: `/api/v1/webknot-value/update/${safeId}` },
        { method: "POST", path: `/api/v1/webknot-value/update/${safeId}` },
        { method: "PUT", path: `/api/v1/webknot-value/edit/${safeId}` },
        { method: "PATCH", path: `/api/v1/webknot-value/edit/${safeId}` },
        { method: "POST", path: `/api/v1/webknot-value/edit/${safeId}` },
    ];
    let lastRouteErr = null;

    for (const endpoint of endpoints) {
        const res = await fetch(buildWebknotValueUrl(endpoint.path), {
            method: endpoint.method,
            credentials: "include",
            headers,
            body: JSON.stringify(payload),
        });
        if (res.ok) return parseResponse(res, {});
        const err = await toHttpError(res);
        if (res.status === 404 || res.status === 405) {
            lastRouteErr = err;
            continue;
        }
        throw err;
    }

    throw lastRouteErr || new Error("Webknot value update endpoint not found.");
}

export async function deleteValue(id) {
    const safeId = encodeURIComponent(String(id ?? "").trim());
    if (!safeId) throw new Error("Value id is required.");
    const auth = getAuthHeader();
    const headers = withCsrfHeaders(auth ? { Authorization: auth } : undefined);
    const endpoints = [`/api/v1/webknot-value/${safeId}`, `/api/v1/webknot-value/delete/${safeId}`];
    let lastRouteErr = null;
    for (const endpoint of endpoints) {
        const res = await fetch(buildWebknotValueUrl(endpoint), {
            method: "DELETE",
            credentials: "include",
            headers,
        });
        if (res.ok) return parseResponse(res, true);
        const err = await toHttpError(res);
        if (res.status === 404 || res.status === 405) {
            lastRouteErr = err;
            continue;
        }
        throw err;
    }
    throw lastRouteErr || new Error("Webknot value delete endpoint not found.");
}
