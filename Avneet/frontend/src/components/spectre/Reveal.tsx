import { ReactNode } from "react";
import { useReveal } from "@/hooks/useReveal";

interface RevealProps {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li";
}

const Reveal = ({ children, delay = 0, className = "", as = "div" }: RevealProps) => {
  const { ref, visible } = useReveal();
  const Tag = as as any;
  return (
    <Tag
      ref={ref as any}
      style={{ animationDelay: visible ? `${delay}ms` : undefined }}
      className={`${visible ? "animate-fade-in-up" : "opacity-0"} ${className}`}
    >
      {children}
    </Tag>
  );
};

export default Reveal;
