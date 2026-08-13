import { Button as BaseButton } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

const variants = cva(
  "inline-flex items-center justify-center border text-[9px] font-semibold uppercase tracking-[.06em] transition-colors disabled:pointer-events-none disabled:opacity-35",
  {
    variants: {
      variant: {
        default:
          "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
        primary:
          "border-[rgba(88,127,158,.48)] bg-[rgba(88,127,158,.15)] text-[var(--blue-soft)]",
        danger:
          "border-[rgba(185,93,93,.35)] bg-[rgba(185,93,93,.08)] text-[#c97878]",
      },
      size: { sm: "h-7 rounded-[3px] px-2", md: "h-8 rounded-[4px] px-3" },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof variants>) {
  return (
    <BaseButton
      className={cn(variants({ variant, size }), className)}
      {...props}
    />
  );
}
