import type { SceneId } from "@/domain/scene";

/** Pure data, one 320x200 viewBox per scene. Renderers decide how it looks. */
export const VIEW_BOX = "0 0 320 200";

export type Role = "wall" | "window" | "object" | "accent" | "light" | "motion";
export type Tone =
  | "canvas"
  | "cream"
  | "rose"
  | "wine"
  | "coffee"
  | "line"
  | "surface"
  | "secondary";
export type Anim = "steam" | "leaf" | "twinkle" | "glow";

export type Shape = {
  id: string;
  kind: "rect" | "circle" | "ellipse" | "path" | "line";
  role: Role;
  attrs: Record<string, number | string>;
  /** Flat fill. Lines and open paths have none. */
  fill?: Tone;
  /** Flat stroke, for lines and open paths. */
  stroke?: { tone: Tone; width: number };
  opacity?: number;
  /** Which loop moves this shape (role "motion" only). */
  anim?: Anim;
  /** Drawn only by fill-based styles (backdrops and light). */
  fillOnly?: boolean;
};

type More = Partial<Pick<Shape, "stroke" | "opacity" | "anim" | "fillOnly">>;
const stroke = (tone: Tone, width: number) => ({ tone, width });

const rect = (
  id: string,
  role: Role,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: Tone,
  rx = 0,
  more: More = {},
): Shape => ({
  id,
  kind: "rect",
  role,
  attrs: { x, y, width, height, rx },
  fill,
  ...more,
});
const circle = (
  id: string,
  role: Role,
  cx: number,
  cy: number,
  r: number,
  fill: Tone,
  more: More = {},
): Shape => ({ id, kind: "circle", role, attrs: { cx, cy, r }, fill, ...more });
const ellipse = (
  id: string,
  role: Role,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  fill: Tone,
): Shape => ({
  id,
  kind: "ellipse",
  role,
  attrs: { cx, cy, rx, ry },
  fill,
});
const path = (
  id: string,
  role: Role,
  d: string,
  fill?: Tone,
  more: More = {},
): Shape => ({ id, kind: "path", role, attrs: { d }, fill, ...more });

const wall = rect("wall", "wall", 0, 0, 320, 200, "canvas", 0, {
  fillOnly: true,
});

/** An arched window centred on x, sitting on a shelf. */
const archedWindow = (x: number, glass: Tone): Shape[] => [
  path("frame", "window", `M${x - 50} 144V72a50 50 0 0 1 100 0v72Z`, "line"),
  path("glass", "window", `M${x - 42} 144V72a42 42 0 0 1 84 0v72Z`, glass),
];
const shelf = rect("shelf", "object", 104, 144, 196, 8, "secondary", 3);

/** A cup on the shelf, its left edge at x. */
const cup = (x: number): Shape[] => [
  path("cup", "accent", `M${x} 122h40v10a20 20 0 0 1-40 0Z`, "rose"),
  ellipse("coffee", "object", x + 20, 122, 20, 3, "wine"),
  path("handle", "object", `M${x + 40} 126h5a7 7 0 0 1 0 14h-6`, undefined, {
    stroke: stroke("wine", 3),
  }),
];
const steam = (id: string, x: number): Shape =>
  path(id, "motion", `M${x} 108q-5-7 0-13t0-12`, undefined, {
    stroke: stroke("secondary", 2),
    anim: "steam",
  });

const W = 238; // the window's centre line

export const scenes: Record<SceneId, Shape[]> = {
  morning: [
    wall,
    ...archedWindow(W, "cream"),
    circle("sun", "accent", W, 76, 16, "rose"),
    path("hills", "object", `M${W - 42} 144v-28q22-14 44-3t40-6v37Z`, "line"),
    shelf,
    ...cup(124),
    steam("steam-a", 138),
    steam("steam-b", 150),
  ],
  afternoon: [
    wall,
    path("patch", "light", "M140 18h96l56 132H170Z", "cream", {
      fillOnly: true,
    }),
    rect("desk", "object", 104, 150, 204, 10, "secondary", 3),
    rect("leg-a", "object", 116, 160, 8, 30, "secondary", 2),
    rect("leg-b", "object", 288, 160, 8, 30, "secondary", 2),
    rect("book-a", "object", 130, 134, 56, 16, "line", 2),
    rect("book-b", "object", 138, 122, 44, 12, "cream", 2, {
      stroke: stroke("line", 1.5),
    }),
    path("pot", "accent", "M220 124h44l-5 26h-34Z", "rose"),
    rect("rim", "object", 216, 116, 52, 9, "wine", 3),
    path("stem", "object", "M242 116V62", undefined, {
      stroke: stroke("secondary", 2.5),
    }),
    path("leaf-l1", "object", "M242 102q-30-2-34-28q28 2 34 28Z", "wine"),
    path("leaf-r1", "object", "M242 90q30-2 34-28q-28 2-34 28Z", "wine"),
    path("leaf-l2", "object", "M242 78q-22-8-22-30q22 8 22 30Z", "wine"),
    path("leaf-top", "motion", "M242 64q-10-18 0-34q10 16 0 34Z", "wine", {
      anim: "leaf",
    }),
  ],
  evening: [
    wall,
    circle("glow-a", "light", 248, 84, 66, "rose", {
      opacity: 0.35,
      fillOnly: true,
    }),
    circle("glow-b", "motion", 248, 84, 40, "rose", {
      opacity: 0.45,
      anim: "glow",
      fillOnly: true,
    }),
    path("shade", "accent", "M224 56h48l10 38h-68Z", "rose"),
    rect("pole", "object", 245, 94, 5, 54, "secondary", 2),
    ellipse("lamp-base", "object", 247, 150, 18, 4, "secondary"),
    rect("sofa-back", "object", 100, 104, 104, 46, "line", 14),
    rect("sofa-arm", "object", 90, 120, 24, 40, "line", 10),
    rect("sofa-seat", "object", 96, 134, 112, 24, "cream", 8, {
      stroke: stroke("line", 1.5),
    }),
    rect("sofa-leg-a", "object", 106, 158, 5, 8, "secondary", 1),
    rect("sofa-leg-b", "object", 192, 158, 5, 8, "secondary", 1),
    path("floor", "object", "M76 166H304", undefined, {
      stroke: stroke("line", 2),
    }),
  ],
  night: [
    wall,
    ...archedWindow(W, "coffee"),
    path(
      "moon",
      "accent",
      `M${W + 6} 58a19 19 0 0 0 0 38a24 24 0 0 1 0-38Z`,
      "cream",
    ),
    circle("star-a", "object", W - 30, 62, 1.8, "cream"),
    circle("star-b", "object", W + 26, 50, 1.8, "cream"),
    circle("star-c", "object", W + 30, 100, 1.8, "cream"),
    circle("star-d", "motion", W - 22, 108, 2.2, "cream", { anim: "twinkle" }),
    circle("star-e", "motion", W + 24, 80, 2.2, "cream", { anim: "twinkle" }),
    shelf,
  ],
  lighter: [
    wall,
    ...archedWindow(W, "cream"),
    shelf,
    ...cup(124),
    steam("steam-a", 144),
  ],
};
