/**
 * Formats seconds as `m:ss` or `h:mm:ss`.
 */
export function formatDuration(total?: number): string {
  if (!total || !isFinite(total)) return "0:00";
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}
