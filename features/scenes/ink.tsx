import type { SceneId } from "@/domain/scene";
import { scenes } from "./geometry";
import { El, Svg, tokenOf } from "./shape";

/** The same shapes as 1.5px coffee strokes; only the accent role is filled. */
export function InkScene({ sceneId }: { sceneId: SceneId }) {
  return (
    <Svg style="ink">
      {scenes[sceneId]
        .filter((s) => !s.fillOnly)
        .map((s) => (
          <El
            key={s.id}
            shape={s}
            paint={{
              fill: s.role === "accent" && s.fill ? tokenOf("rose") : "none",
              stroke: tokenOf("coffee"),
              strokeWidth: 1.5,
              strokeLinecap: "round",
              strokeLinejoin: "round",
            }}
          />
        ))}
    </Svg>
  );
}
