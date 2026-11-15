import {
  useLayoutEffect,
  useRef,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AuraGlassSurface } from "./materials";
import { Check } from "lucide-react";
export type MenuAction = {
  label: string;
  icon?: ReactNode;
  action: () => void;
  disabled?: boolean;
  destructive?: boolean;
  checked?: boolean;
};
export type MenuPosition = {
  x: number;
  y: number;
  restore?: HTMLElement | null;
};
export function AuraContextMenu({
  position,
  items,
  onClose,
  label = "Track actions",
}: {
  position: MenuPosition;
  items: (MenuAction | "separator")[];
  onClose: () => void;
  label?: string;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const close = () => {
    if (closeTimer.current) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onClose();
      return;
    }
    setLeaving(true);
    closeTimer.current = setTimeout(onClose, 120);
  };
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  const [point, setPoint] = useState({ x: position.x, y: position.y });
  useLayoutEffect(() => {
    const element = menu.current!;
    const bounds = { width: element.offsetWidth, height: element.offsetHeight };
    setPoint({
      x: Math.max(12, Math.min(position.x, innerWidth - bounds.width - 12)),
      y: Math.max(12, Math.min(position.y, innerHeight - bounds.height - 12)),
    });
    element
      .querySelector<HTMLButtonElement>("button:not(:disabled)")
      ?.focus({ preventScroll: true });
    const dismiss = (event: PointerEvent) => {
      if (!element.contains(event.target as Node)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    };
    const resize = () => close();
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("keydown", escape, true);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("keydown", escape, true);
      window.removeEventListener("resize", resize);
      position.restore?.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <AuraGlassSurface
      material="panel"
      className="context-menu"
      ref={menu}
      role="menu"
      aria-label={label}
      data-phase={leaving ? "leaving" : "open"}
      style={{ left: point.x, top: point.y }}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        const buttons = [
          ...menu.current!.querySelectorAll<HTMLButtonElement>(
            "button:not(:disabled)",
          ),
        ];
        const index = buttons.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          event.stopPropagation();
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? buttons.length - 1
                : (index +
                    (event.key === "ArrowDown" ? 1 : -1) +
                    buttons.length) %
                  buttons.length;
          buttons[next]?.focus();
        }
        if (event.key === "Tab") {
          event.preventDefault();
          close();
        }
      }}
    >
      {items.map((item, index) =>
        item === "separator" ? (
          <div key={index} role="separator" className="menu-divider" />
        ) : (
          <button
            key={index}
            type="button"
            role={item.checked === undefined ? "menuitem" : "menuitemcheckbox"}
            aria-checked={item.checked}
            disabled={item.disabled}
            className={item.destructive ? "destructive" : ""}
            onClick={() => {
              if(leaving)return;
              item.action();
              close();
            }}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.checked && (
              <Check className="menu-check" aria-hidden="true" />
            )}
          </button>
        ),
      )}
    </AuraGlassSurface>,
    document.body,
  );
}
