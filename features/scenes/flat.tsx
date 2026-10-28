import type { SceneId } from "@/domain/scene";
import { scenes } from "./geometry";
import { El, Svg, tokenOf } from "./shape";

/** Filled shapes in palette colours. */
export function FlatScene({ sceneId }: { sceneId: SceneId }) {
  return (
    <Svg style="flat">
      {scenes[sceneId].map((s) => (
        <El
          key={s.id}
          shape={s}
          paint={{
            fill: s.fill ? tokenOf(s.fill) : "none",
            stroke: s.stroke ? tokenOf(s.stroke.tone) : undefined,
            strokeWidth: s.stroke?.width,
            strokeLinecap: "round",
            strokeLinejoin: "round",
            opacity: s.opacity,
          }}
        />
      ))}
    </Svg>
  );
}
