"use client";
import { useSession } from "@/components/session";
import {
  PageHeading,
  Select,
  Toggle,
  Notice,
  ActionLink,
} from "@/components/ui";
import { tone, type ToneSetting } from "@/domain/tone";
export function Appearance() {
  const { state, dispatch } = useSession();
  const appearance = state.appearance;
  return (
    <>
      <PageHeading
        eyebrow="Settings"
        description="Choose the voice and view that suit you. Changes apply across this session."
      >
        Appearance
      </PageHeading>
      <div className="prose">
        <Select
          label="Voice"
          value={appearance.tone}
          onChange={(value) =>
            dispatch({
              type: "appearance",
              value: { tone: value as ToneSetting },
            })
          }
          options={[
            { value: "expressive", label: "Expressive · warm and upbeat" },
            { value: "calm", label: "Calm · quiet and steady" },
            { value: "plain", label: "Plain · direct and simple" },
          ]}
        />
        <Notice>
          {tone(appearance.tone, "welcome", state.energy).message}
        </Notice>
        <p className="hint">
          Low energy, setbacks, reflection and Help always use a calmer voice.
          Unknown or absent reports are never treated as failure.
        </p>
        <hr className="divider" />
        <Toggle
          label="Plain view"
          checked={appearance.plain}
          onChange={(value) =>
            dispatch({ type: "appearance", value: { plain: value } })
          }
        />
        <p className="hint">
          Lighter task surfaces, simple type and no mascot.
        </p>
        <Toggle
          label="Reduce motion"
          checked={appearance.reducedMotion}
          onChange={(value) =>
            dispatch({ type: "appearance", value: { reducedMotion: value } })
          }
        />
        <p className="hint">
          Your device preference for reduced motion also applies. The small
          mascot is static in every context.
        </p>
        <Toggle
          label="Show the small mascot"
          checked={appearance.mascot}
          onChange={(value) =>
            dispatch({ type: "appearance", value: { mascot: value } })
          }
        />
        <div className="actions">
          <ActionLink href="/today">See Today →</ActionLink>
          <ActionLink href="/settings" secondary>
            Back to Settings →
          </ActionLink>
        </div>
      </div>
    </>
  );
}
