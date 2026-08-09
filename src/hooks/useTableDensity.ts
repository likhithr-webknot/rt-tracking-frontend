import { useEffect, useState } from "react";

export type TableDensity = "default" | "comfortable";

const STORAGE_KEY = "rt_tracking_table_density_v1";

function readDensity(): TableDensity {
  if (typeof window === "undefined") return "default";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === "comfortable" ? "comfortable" : "default";
  } catch {
    return "default";
  }
}

/** Shared Default / Comfortable table density preference. */
export function useTableDensity() {
  const [density, setDensityState] = useState<TableDensity>(() => readDensity());

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, density);
    } catch {
      void 0;
    }
  }, [density]);

  function setDensity(next: TableDensity) {
    setDensityState(next === "comfortable" ? "comfortable" : "default");
  }

  return { density, setDensity };
}
