import styles from "./StudentMessage.module.css";

export default function StudentMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.row}>
      <div className={styles.bubble}>{children}</div>
    </div>
  );
}
