import { Button } from './Button';
import styles from './StateMessage.module.css';

interface ErrorStateProps {
  title: string;
  message: string;
  retryLabel: string;
  onRetry: () => void;
}

export function ErrorState({ title, message, retryLabel, onRetry }: ErrorStateProps) {
  return (
    <div className={styles.state} role="alert">
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.message}>{message}</p>
      <Button variant="solid" onClick={onRetry}>
        {retryLabel}
      </Button>
    </div>
  );
}
