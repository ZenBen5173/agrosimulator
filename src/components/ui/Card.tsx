"use client";

import { motion, type HTMLMotionProps } from "framer-motion";

interface CardProps extends HTMLMotionProps<"div"> {
  variant?: "default" | "glass" | "elevated";
  pressable?: boolean;
  children: React.ReactNode;
}

const variantStyles: Record<string, string> = {
  default: "bg-white rounded-2xl border border-gray-100",
  glass:
    "bg-white/60 backdrop-blur-xl rounded-2xl border border-white/30 shadow-lg",
  elevated:
    "bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.08)] border border-gray-50",
};

export default function Card({
  variant = "default",
  pressable = false,
  children,
  className = "",
  ...props
}: CardProps) {
  return (
    <motion.div
      className={`${variantStyles[variant]} ${className}`}
      whileTap={pressable ? { scale: 0.97 } : undefined}
      {...props}
    >
      {children}
    </motion.div>
  );
}
