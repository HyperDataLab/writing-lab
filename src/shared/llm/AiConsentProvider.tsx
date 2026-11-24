"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { grantAiConsent, hasAiConsent } from "@/shared/llm/settings";

type AiConsentContextValue = { requestAiConsent: () => Promise<boolean> };
const AiConsentContext = createContext<AiConsentContextValue | null>(null);

export function AiConsentProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const resolver = useRef<((accepted: boolean) => void) | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const requestAiConsent = useCallback(() => {
    if (hasAiConsent()) return Promise.resolve(true);
    if (resolver.current) return Promise.resolve(false);
    setOpen(true);
    return new Promise<boolean>((resolve) => { resolver.current = resolve; });
  }, []);

  const close = useCallback((accepted: boolean) => {
    if (accepted) grantAiConsent();
    setOpen(false);
    resolver.current?.(accepted);
    resolver.current = null;
  }, []);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); close(false); }
      if (event.key !== "Tab") return;
      const buttons = document.querySelectorAll<HTMLButtonElement>("[data-ai-consent-dialog] button");
      if (buttons.length < 2) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [close, open]);

  return <AiConsentContext.Provider value={{ requestAiConsent }}>
    {children}
    {open && createPortal(
      <div className="ai-consent-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) close(false); }}>
        <section className="ai-consent-dialog" data-ai-consent-dialog role="alertdialog" aria-modal="true" aria-labelledby="ai-consent-title" aria-describedby="ai-consent-description">
          <div className="ai-consent-icon" aria-hidden="true">AI</div>
          <p className="eyebrow">QUYỀN RIÊNG TƯ</p>
          <h2 id="ai-consent-title">Gửi nội dung tới AI?</h2>
          <p id="ai-consent-description">Thao tác này sẽ gửi văn bản bạn chọn tới model AI qua 9router. Chỉ tiếp tục nếu bạn đồng ý gửi nội dung này.</p>
          <p className="ai-consent-note">Nội dung chỉ được gửi khi bạn chọn tiếp tục. Bạn có thể thu hồi lựa chọn trong phần Cài đặt.</p>
          <div className="ai-consent-actions">
            <button className="secondary-button" type="button" ref={cancelRef} onClick={() => close(false)}>Hủy</button>
            <button className="primary-button" type="button" onClick={() => close(true)}>Đồng ý và tiếp tục</button>
          </div>
        </section>
      </div>,
      document.body,
    )}
  </AiConsentContext.Provider>;
}

export function useAiConsent() {
  const context = useContext(AiConsentContext);
  if (!context) throw new Error("useAiConsent phải được dùng bên trong AiConsentProvider.");
  return context.requestAiConsent;
}
