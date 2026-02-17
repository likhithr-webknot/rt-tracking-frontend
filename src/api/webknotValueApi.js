import { buildApiUrl } from "./http.js";

export async function fetchValues(activeOnly = true) {
    const res = await fetch(buildApiUrl(`/webknot-values/list?activeOnly=${activeOnly}`));
    if (!res.ok) throw new Error("Failed to fetch values");
    return res.json();
}

export async function addValue(data) {
    const res = await fetch(buildApiUrl("/webknot-values/add"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
    }

    return res.json();
}

export async function updateValue(id, data) {
    const res = await fetch(buildApiUrl(`/webknot-values/update/${id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
    }

    return res.json();
}

export async function deleteValue(id) {
    const res = await fetch(buildApiUrl(`/webknot-values/delete/${id}`), {
        method: "DELETE",
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
    }

    return true;
}
