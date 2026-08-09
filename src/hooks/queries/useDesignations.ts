import { useQuery } from "@tanstack/react-query";
import { fetchDesignations } from "../../api/designations";
import { queryKeys } from "./keys";

export function useDesignations(
  bandId: string | number | null | undefined,
  department: string | null | undefined
) {
  return useQuery({
    enabled: bandId != null && String(bandId).trim() !== "" && !!department,
    queryKey: queryKeys.designations.forBandDepartment(bandId, department),
    queryFn: ({ signal }) =>
      fetchDesignations({ bandId: bandId as string | number, department: department as string, signal }),
    staleTime: 5 * 60_000,
  });
}
