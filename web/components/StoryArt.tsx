/**
 * Cover art for a story, or a stand-in until there is some.
 *
 * The stand-in is derived from the story id rather than random or uniform: a
 * commissioner learns the shelf by shape and colour long before they re-read
 * the titles, and that only works if a story looks the same on every visit. Two
 * washes over a warm ground, hue picked from the id — abstract key art, not a
 * grey box with an icon, because a grey box reads as "broken" and this reads as
 * "not photographed yet".
 *
 * When real art arrives it goes in `src` and nothing else on the page moves.
 */

/** Stable small integer from an id. Not a hash anyone should depend on. */
function seed(id: string): number {
  let n = 0;
  for (let i = 0; i < id.length; i += 1) n = (n * 31 + id.charCodeAt(i)) >>> 0;
  return n;
}

export function StoryArt({
  id,
  src,
  alt,
  className = "",
  children,
}: {
  id: string;
  /** Real cover art, once a story has some. */
  src?: string | null;
  alt?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const n = seed(id);
  // Two hues a third of the wheel apart, so the pair always has contrast
  // without either being able to land on the ochre the UI reserves for action.
  const a = n % 360;
  const b = (a + 120 + (n % 40)) % 360;
  const x = 14 + (n % 26);
  const y = 74 + (n % 18);

  return (
    <div
      className={`relative overflow-hidden bg-tile ${className}`}
      style={
        src
          ? undefined
          : {
              backgroundImage: [
                `radial-gradient(115% 85% at ${x}% 12%, oklch(0.44 0.09 ${a}) 0%, transparent 58%)`,
                `radial-gradient(105% 95% at 88% ${y}%, oklch(0.40 0.07 ${b}) 0%, transparent 62%)`,
                `linear-gradient(155deg, #2a2028 0%, #13100f 100%)`,
              ].join(", "),
            }
      }
    >
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- art is served
        // from the story directory, not the image pipeline.
        <img src={src} alt={alt ?? ""} className="absolute inset-0 h-full w-full object-cover" />
      )}

      {/* Grain, then a scrim. The scrim is what lets a title sit over any
          artwork at all — without it the type is legible on the placeholders
          and unreadable on the first real photograph that arrives. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "3px 3px",
        }}
      />
      {children && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(16,14,12,0) 38%, rgba(16,14,12,0.88) 100%)",
          }}
        />
      )}
      {children}
    </div>
  );
}
