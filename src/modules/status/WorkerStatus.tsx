"use client";

import { useEffect, useState } from "react";

type Status = "checking" | "online" | "offline";

export function WorkerStatus() {
  const apiUrl = process.env.NEXT_PUBLIC_WORKER_API_URL;
  const [status, setStatus] = useState<Status>(apiUrl ? "checking" : "offline");

  useEffect(() => {
    if (!apiUrl) return;

    const controller = new AbortController();
    fetch(`${apiUrl.replace(/\/$/, "")}/api/health`, { signal: controller.signal })
      .then((response) => setStatus(response.ok ? "online" : "offline"))
      .catch(() => setStatus("offline"));

    return () => controller.abort();
  }, [apiUrl]);

  const message = {
    checking: "Đang kiểm tra Cloudflare Worker…",
    online: "Cloudflare Worker đang hoạt động.",
    offline: "Chưa kết nối được Cloudflare Worker. Hãy kiểm tra cấu hình và chạy Worker local.",
  }[status];

  return <section className="status" aria-live="polite">{message}</section>;
}
