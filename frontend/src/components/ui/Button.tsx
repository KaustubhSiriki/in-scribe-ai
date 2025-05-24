'use client';
import { motion, HTMLMotionProps } from 'framer-motion';

interface ButtonProps extends HTMLMotionProps<'button'> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
}

const colors = {
  primary: 'bg-accent-primary hover:bg-accent-secondary text-white shadow-lg',
  secondary: 'bg-accent-secondary hover:bg-accent-primary text-white shadow',
  danger: 'bg-error hover:bg-red-600 text-white shadow',
  ghost: 'bg-transparent hover:bg-accent-primary/10 text-accent-primary',
};

export function Button({ variant = 'primary', children, ...props }: ButtonProps) {
  return (
    <motion.button
      whileHover={{ scale: 1.035, y: -2 }}
      whileTap={{ scale: 0.97 }}
      className={`inline-flex items-center px-6 py-3 rounded-2xl font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-accent-primary/70 ${colors[variant]}`}
      {...props}
    >
      {children}
    </motion.button>
  );
}
