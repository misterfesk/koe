import type { ReactNode } from "react";
import type { SceneId } from "@/domain/scene";
import { GreetingScene } from "../scenes/greeting-scene";
import type { SceneStyle } from "../scenes/style";
import styles from "./today.module.css";

/** The top card: greeting, date, how the day stands, then the check-in. */
export function Greeting({
  greeting,
  date,
  state,
  scene,
  sceneStyle,
  children,
}: {
  greeting: string;
  date: string;
  state: string;
  scene: SceneId;
  sceneStyle: SceneStyle;
  children: ReactNode;
}) {
  return (
    <section className={styles.greeting} aria-label="Today">
      <GreetingScene
        scene={scene}
        saved={sceneStyle}
        className={styles.scene}
      />
      <div className={styles.greetingText}>
        <h1 className={styles.greetingTitle}>{greeting}</h1>
        <p className={styles.date}>{date}</p>
        <p className={styles.state}>{state}</p>
        {children}
      </div>
    </section>
  );
}
