import {
  forwardRef,
  type HTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { Glass, Button } from "glisse";

export const AuraGlassSurface = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & { material?: "clear" | "panel" }
>(function AuraGlassSurface(
  { className = "", material = "clear", ...props },
  ref,
) {
  return (
    <Glass
      ref={ref}
      className={`aura-material material-${material} ${className}`}
      {...props}
    />
  );
});
export const AuraIconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { label: string }
>(function AuraIconButton({ label, className = "", children, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={`icon-button ${className}`}
      title={label}
      aria-label={label}
      {...props}
    >
      {children}
    </button>
  );
});
export function AuraLiquidButton({
  children,
  className = "",
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button className={`liquid-button ${className}`} {...props}>
      {children}
    </Button>
  );
}
export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}
