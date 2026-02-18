import { getAuthHeader } from "./auth.js";
import { buildApiUrl, withCsrfHeaders } from "./http.js";

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

    // Attempt to unwrap common shapes like { name: "..." } or { title: "..." }.
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

    // Direct + case-insensitive match
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

    // Recurse into nested objects/arrays
    for (const v of Object.values(obj)) {
        if (!v || typeof v !== "object") continue;
        const s = pickDeep(v, keyList, depth + 1);
        if (s) return s;
    }
    return "";
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
        pillar: pillar || title || "—",
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
        const v = normalizeWebknotValue(arr[i], i);
        const key = String(v.id);
        if (!key) continue;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(v);
    }
    return out;
}

async function readError(res) {
    const text = await res.text().catch(() => "");
    try {
        const parsed = JSON.parse(text);
        if (parsed?.message) return String(parsed.message);
        if (parsed?.error) return String(parsed.error);
    } catch {
        // ignore
    }
    return text || `Request failed: ${res.status} ${res.statusText}`;
}

async function toHttpError(res) {
    const message = await readError(res);
    const err = new Error(message);
    err.status = res.status;
    return err;
}

export async function fetchValues(activeOnly = true, { limit = null, cursor = null, signal } = {}) {
    const auth = getAuthHeader();
    const qs = new URLSearchParams();
    qs.set("activeOnly", String(activeOnly));
    if (limit != null) qs.set("limit", String(limit));
    if (cursor) qs.set("cursor", String(cursor));
    const res = await fetch(buildApiUrl(`/webknot-values/list?${qs.toString()}`), {
        signal,
        credentials: "include",
        headers: auth ? { Authorization: auth } : undefined,
    });
    if (!res.ok) throw await toHttpError(res);
    return res.json().catch(() => ([]));
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
        pillar,
        valuePillar: pillar,
        valuePillarName: pillar,
        pillarName: pillar,
        description,
        valueDescription: description,
        desc: description,
    };
    const res = await fetch(buildApiUrl("/webknot-values/add"), {
        method: "POST",
        credentials: "include",
        headers: withCsrfHeaders({
            "Content-Type": "application/json",
            ...(auth ? { Authorization: auth } : {}),
        }),
        body: JSON.stringify(payload),
    });

    if (!res.ok) throw await toHttpError(res);
    return res.json().catch(() => ({}));
}

export async function updateValue(id, data) {
    const auth = getAuthHeader();
    const title = toCleanString(data?.title);
    const pillar = toCleanString(data?.pillar);
    const description = toCleanString(data?.description);
    const payload = {
        ...(data && typeof data === "object" ? data : {}),
        title,
        valueTitle: title,
        name: title,
        pillar,
        valuePillar: pillar,
        valuePillarName: pillar,
        pillarName: pillar,
        description,
        valueDescription: description,
        desc: description,
    };
    const res = await fetch(buildApiUrl(`/webknot-values/update/${id}`), {
        method: "PUT",
        credentials: "include",
        headers: withCsrfHeaders({
            "Content-Type": "application/json",
            ...(auth ? { Authorization: auth } : {}),
        }),
        body: JSON.stringify(payload),
    });

    if (!res.ok) throw await toHttpError(res);
    return res.json().catch(() => ({}));
}

export async function deleteValue(id) {
    const auth = getAuthHeader();
    const res = await fetch(buildApiUrl(`/webknot-values/delete/${id}`), {
        method: "DELETE",
        credentials: "include",
        headers: withCsrfHeaders(auth ? { Authorization: auth } : undefined),
    });

    if (!res.ok) throw await toHttpError(res);
    return true;
}
