export function profileNeedsOnboarding(): boolean {
  return false;
}

export function isFetchMeNotFoundError(err: unknown): boolean {
  const message = String((err as Error)?.message ?? "").toLowerCase();
  const status = Number((err as { status?: number })?.status ?? 0);
  return (
    status === 404 ||
    message.includes("not found") ||
    message.includes("profile endpoint not found") ||
    message.includes("unregistered")
  );
}
