import styles from "./SourceBadge.module.css";

export default function SourceBadge({ sources }: { sources: string[] }) {
  return (
    <div className={styles.sources}>
      {sources.map((s, i) => (
        <span key={i} className={styles.badge}>
          📄 {s}
        </span>
      ))}
    </div>
  );
}
