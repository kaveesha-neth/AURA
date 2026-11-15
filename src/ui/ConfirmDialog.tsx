import { useEffect, useState, useRef } from "react";
import {
  AuraLiquidButton as Button,
  AuraGlassSurface as Glass,
} from "./materials";
declare global {
  interface Window {
    auraConfirm: (message: string) => Promise<boolean>;
  }
}
export function ConfirmDialog() {
  const [message, setMessage] = useState("");
  const resolve = useRef<(value: boolean) => void>(() => {});
  const previous = useRef<HTMLElement | null>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  function finish(value: boolean) {
    resolve.current(value);
    setMessage("");
    previous.current?.focus();
  }
  useEffect(() => {
    window.auraConfirm = (message) =>
      new Promise<boolean>((done) => {
        previous.current = document.activeElement as HTMLElement;
        resolve.current = done;
        setMessage(message);
      });
  }, []);
  useEffect(() => {
    if (message) cancel.current?.focus();
  }, [message]);
  if (!message) return null;
  return (
    <div
      className="confirmation-backdrop"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          finish(false);
        }
        if (e.key === "Tab") {
          e.preventDefault();
          const buttons = e.currentTarget.querySelectorAll("button");
          (document.activeElement === buttons[0]
            ? buttons[1]
            : buttons[0]
          ).focus();
        }
      }}
    >
      <Glass
        className="confirmation-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirmation-title"
        aria-describedby="confirmation-message"
      >
        <h2 id="confirmation-title">Clear saved sources?</h2>
        <p id="confirmation-message">{message}</p>
        <div>
          <Button ref={cancel} onClick={() => finish(false)}>
            Keep sources
          </Button>
          <Button destructive onClick={() => finish(true)}>
            Clear sources
          </Button>
        </div>
      </Glass>
    </div>
  );
}
