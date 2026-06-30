"use client";

import { useState } from "react";
import styles from "./Composer.module.css";

export default function Composer({
  onSend,
  disabled = false,
  placeholder = "Type your answer…",
}: {
  onSend: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [value, setValue] = useState("");

  function send() {
    const v = value.trim();
    if (!v || disabled) return;
    onSend(v);
    setValue("");
  }

  return (
    <form
      className={styles.composer}
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <input
        className={styles.input}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        aria-label="Your message"
      />
      <button className={styles.send} type="submit" disabled={disabled || !value.trim()}>
        Send
      </button>
    </form>
  );
}
