"use client";

import { useEffect, useState } from "react";
import { hasAiConsent, readLlmSettings, revokeAiConsent, writeLlmSettings, type LlmSettings } from "@/shared/llm/settings";
import { useAiConsent } from "@/shared/llm/AiConsentProvider";

export function SettingsWorkspace() {
  const requestAiConsent = useAiConsent();
  const [settings, setSettings] = useState<LlmSettings>({ baseUrl: "", model: "", apiKey: "" });
  const [consent, setConsent] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void Promise.resolve().then(() => {
      setSettings(readLlmSettings());
      setConsent(hasAiConsent());
    });
  }, []);

  function save() {
    writeLlmSettings(settings);
    setNotice("Đã lưu cấu hình trên trình duyệt này.");
  }

  function withdraw() {
    revokeAiConsent();
    setConsent(false);
    setNotice("Đã thu hồi đồng ý gửi nội dung tới model.");
  }

  async function reviewConsent() {
    const accepted = await requestAiConsent();
    setConsent(hasAiConsent());
    if (accepted) setNotice("Đã lưu đồng ý gửi nội dung tới model.");
  }

  return (
    <div className="tool-page settings-page">
      <header className="tool-header">
        <div>
          <p className="eyebrow">SETTINGS · PRIVATE BY DEFAULT</p>
          <h1>Cài đặt</h1>
          <p>Quản lý kết nối AI và quyền riêng tư cho trình duyệt hiện tại.</p>
        </div>
        <span className="badge">LOCAL SETTINGS</span>
      </header>

      <div className="settings-grid">
        <section className="panel settings-panel settings-provider-panel">
          <div className="settings-section-heading">
            <div>
              <h2>Kết nối 9router</h2>
              <p>Cấu hình endpoint và model dùng cho các tác vụ viết.</p>
            </div>
            <span className="settings-local-label">Lưu trên thiết bị này</span>
          </div>

          <div className="settings-fields">
            <label className="settings-field" htmlFor="base-url">
              <span>Base URL</span>
              <input id="base-url" className="text-input" value={settings.baseUrl} onChange={(event) => setSettings({ ...settings, baseUrl: event.target.value })} placeholder="https://9router.dcloud.io.vn/v1" />
              <small>Địa chỉ API tương thích OpenAI.</small>
            </label>
            <label className="settings-field" htmlFor="model">
              <span>Model</span>
              <input id="model" className="text-input" value={settings.model} onChange={(event) => setSettings({ ...settings, model: event.target.value })} placeholder="cx/gpt-6-luna" />
              <small>Tên model được cung cấp bởi 9router.</small>
            </label>
            <label className="settings-field settings-field-wide" htmlFor="api-key">
              <span>API key</span>
              <input id="api-key" type="password" autoComplete="off" className="text-input" value={settings.apiKey} onChange={(event) => setSettings({ ...settings, apiKey: event.target.value })} placeholder="Nhập API key của bạn" />
              <small>Key nằm trong localStorage và chỉ gửi trong header tới Worker. Worker chỉ chuyển request tới hostname được cho phép.</small>
            </label>
          </div>

          <div className="settings-actions">
            <button className="primary-button" onClick={save}>Lưu cấu hình</button>
            <span className="hint">Thông tin này không đồng bộ sang thiết bị khác.</span>
          </div>
        </section>

        <section className="panel settings-panel settings-consent-panel">
          <div className="settings-section-heading">
            <div>
              <h2>Quyền riêng tư AI</h2>
              <p>Quyết định có gửi nội dung tới model hay không.</p>
            </div>
            <span className={consent ? "badge" : "badge muted-badge"}>
              {consent ? "Đã đồng ý" : "Chưa đồng ý"}
            </span>
          </div>
          <p className="settings-privacy-copy">Nội dung chỉ được gửi tới model sau khi bạn đồng ý. Quyết định được lưu trong trình duyệt này và có thể thu hồi bất cứ lúc nào.</p>
          <div className="settings-actions settings-consent-actions">
            <button className="secondary-button" onClick={() => void reviewConsent()}>Xem nội dung đồng ý</button>
            {consent && <button className="secondary-button" onClick={withdraw}>Thu hồi đồng ý</button>}
          </div>
        </section>

        <section className="panel settings-panel settings-data-panel">
          <div className="settings-section-heading">
            <div>
              <h2>Dữ liệu và phiên làm việc</h2>
              <p>Cách Writing Lab kết nối với workspace của bạn.</p>
            </div>
          </div>
          <p className="settings-data-copy">Phiên đăng nhập được nhận từ ResearchHub. Worker xác minh quyền project theo từng request; bản ghi Writing Lab được lưu riêng trong Firestore theo tài khoản và project.</p>
          <div className="settings-data-meta"><span>ResearchHub</span><span>Cloud Firestore</span><span>Theo project</span></div>
        </section>
      </div>

      {notice && <p className="success-note settings-notice" role="status">{notice}</p>}
    </div>
  );
}
