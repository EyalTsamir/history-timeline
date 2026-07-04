import type { ComponentProps } from 'react';
import styles from './Button.module.css';

interface ButtonProps extends ComponentProps<'button'> {
  variant?: 'solid' | 'ghost' | undefined;
}

/** Token-driven button; defaults to type="button" so forms never submit by accident. */
export function Button({ variant = 'ghost', className, type, ...rest }: ButtonProps) {
  const cls = [styles.button, styles[variant], className].filter(Boolean).join(' ');
  return <button type={type ?? 'button'} className={cls} {...rest} />;
}
