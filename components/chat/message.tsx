import styles from "./chat.module.css";

export type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

/** Plain checked text only. No HTML/Markdown execution or live announcements. */
export function Message({ role, text }: Omit<ChatMessage, "id">) {
  return (
    <div
      className={role === "user" ? styles.userMessage : styles.assistantMessage}
    >
      <span className={styles.srOnly}>{role === "user" ? "You" : "Koe"}: </span>
      {text}
    </div>
  );
}
