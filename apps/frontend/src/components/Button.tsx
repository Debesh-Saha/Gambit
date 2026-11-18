import { ButtonHTMLAttributes } from 'react';

const styles = {
  primary: 'bg-green-600 hover:bg-green-500',
  danger: 'bg-red-600 hover:bg-red-500',
};

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof styles }) {
  return (
    <button
      className={`rounded-lg px-6 py-3 font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
      {...props}
    />
  );
}