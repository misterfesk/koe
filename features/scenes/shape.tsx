import type { ReactNode } from "react";
import { VIEW_BOX, type Anim, type Shape } from "./geometry";
import styles from "./scenes.module.css";

export const tokenOf = (tone: string) => `var(--${tone})`;

/** The shared inline SVG shell: decorative, never read out or focusable. */
export function Svg({
  style,
  children,
}: {
  style: string;
  children: ReactNode;
}) {
  return (
    <svg
      className={styles.svg}
      data-style={style}
      viewBox={VIEW_BOX}
      preserveAspectRatio="xMaxYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

const animClass: Record<Anim, string> = {
  steam: styles.steam,
  leaf: styles.leaf,
  twinkle: styles.twinkle,
  glow: styles.glow,
};

type Paint = Record<string, string | number | undefined>;

/** One geometry shape as an element, with the style's own paint props. */
export function El({ shape, paint }: { shape: Shape; paint: Paint }) {
  const props = {
    ...shape.attrs,
    ...paint,
    className: shape.anim
      ? `${styles.anim} ${animClass[shape.anim]}`
      : undefined,
    "data-role": shape.role,
  };
  switch (shape.kind) {
    case "rect":
      return <rect {...props} />;
    case "circle":
      return <circle {...props} />;
    case "ellipse":
      return <ellipse {...props} />;
    case "path":
      return <path {...props} />;
    case "line":
      return <line {...props} />;
  }
}
