/** A display-sized excerpt. The full field always remains in its disclosure. */
export function hook(sell: string | null): string | null {
  if (!sell) return null;
  const first = sell.match(/^[\s\S]*?[.!?](?=\s|$)/)?.[0]?.trim() ?? sell.trim();
  const words = first.split(/\s+/);
  if (words.length <= 34) return first;
  const clipped = words.slice(0, 34).join(" ");
  const brk = Math.max(clipped.lastIndexOf(" — "), clipped.lastIndexOf(", "));
  return `${brk > 60 ? clipped.slice(0, brk) : clipped}…`;
}
