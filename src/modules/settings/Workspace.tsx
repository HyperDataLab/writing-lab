"use client";

import { useEffect, useState } from "react";
import { hasAiConsent, readLlmSettings, revokeAiConsent, writeLlmSettings, type LlmSettings } from "@/shared/llm/settings";
import { useAiConsent } from "@/shared/llm/AiConsentProvider";

export function SettingsWorkspace() {
  const requestAiConsent = useAiConsent();
  const [settings, setSettings] = useState<LlmSettings>({ baseUrl: "", model: "", apiKey: "" });
  const [consent, setConsent] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => { void Promise.resolve().then(() => { setSettings(readLlmSettings()); setConsent(hasAiConsent()); }); }, []);
  function save() { writeLlmSettings(settings); setNotice("Đã lưu cấu hình trên trình duyệt này."); }
  function withdraw() { revokeAiConsent(); setConsent(false); setNotice("Đã thu hồi đồng ý gửi nội dung tới model."); }
  async function reviewConsent() {
    const accepted = await requestAiConsent();
    setConsent(hasAiConsent());
    if (accepted) setNotice("Đã lưu đồng ý gửi nội dung tới model.");
  }
  return <div className="tool-page"><header className="tool-header"><div><p className="eyebrow">SETTINGS · PRIVATE BY DEFAULT</p><h1>Cài đặt</h1><p>API key và quyết định đồng ý chỉ lưu trong trình duyệt hiện tại.</p></div><span className="badge">LOCAL SETTINGS</span></header>
    <section className="panel settings-panel"><h2>9router</h2><label className="field-label" htmlFor="base-url">Base URL</label><input id="base-url" className="text-input" value={settings.baseUrl} onChange={(event) => setSettings({ ...settings, baseUrl: event.target.value })} placeholder="https://9router.dcloud.io.vn/v1" /><label className="field-label" htmlFor="model">Model</label><input id="model" className="text-input" value={settings.model} onChange={(event) => setSettings({ ...settings, model: event.target.value })} placeholder="cx/gpt-6-luna" /><label className="field-label" htmlFor="api-key">API key</label><input id="api-key" type="password" autoComplete="off" className="text-input" value={settings.apiKey} onChange={(event) => setSettings({ ...settings, apiKey: event.target.value })} /><p className="hint">Key được giữ trong localStorage và chỉ gửi trong header tới Worker. Worker chỉ chuyển request tới hostname đã allowlist.</p><button className="primary-button" onClick={save}>Lưu cấu hình</button></section>
    <section className="panel settings-panel"><h2>Quyền riêng tư AI</h2><div className="privacy-box">Nội dung chỉ được gửi tới model sau khi bạn đồng ý. Đồng ý được lưu trong trình duyệt này; bạn có thể thu hồi bất cứ lúc nào.</div><div className="button-row"><span className={consent ? "badge" : "badge muted-badge"}>{consent ? "Đã đồng ý trước đó" : "Chưa có đồng ý lưu"}</span><button className="secondary-button" onClick={() => void reviewConsent()}>Xem nội dung đồng ý</button>{consent && <button className="secondary-button" onClick={withdraw}>Thu hồi</button>}</div></section>
    <section className="panel settings-panel"><h2>Dữ liệu &amp; phiên làm việc</h2><p className="hint">Phiên đăng nhập lấy từ ResearchHub; mỗi request Worker kiểm tra lại quyền project. Writing records được lưu riêng trong Firestore theo tài khoản và project, không ghi vào ResearchHub paper workspace.</p></section>{notice && <p className="success-note">{notice}</p>}
  </div>;
}
