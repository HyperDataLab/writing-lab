"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AlertCircle, LoaderCircle, ShieldCheck } from "lucide-react";
import { useAuth } from "./authContext";
import { RESEARCH_HUB_URL } from "./config";
import { workerRequest } from "@/shared/worker/api";

type Project = { id: string; name: string };
type ProjectVerification = { key: string; project: Project };
type ProjectFailure = { key: string; message: string };

export function ProjectAccessGate({ children }: { children: ReactNode }) {
  const { user, projectId, ready, error, handoffFailed, signIn, getAccessToken } = useAuth();
  const userId = user?.sub ?? null;
  const verificationKey = `${userId ?? ""}:${projectId ?? ""}`;
  const [verification, setVerification] = useState<ProjectVerification | null>(null);
  const [projectFailure, setProjectFailure] = useState<ProjectFailure | null>(null);

  useEffect(() => {
    if (!ready || !userId || !projectId) return;
    let active = true;
    const key = `${userId}:${projectId}`;
    void workerRequest<{ project: Project }>({ getToken: getAccessToken, projectId }, "/v1/me")
      .then((body) => { if (active) { setVerification({ key, project: body.project }); setProjectFailure(null); } })
      .catch((cause: unknown) => { if (active) setProjectFailure({ key, message: cause instanceof TypeError ? "Không kết nối được Writing Lab Worker. Kiểm tra NEXT_PUBLIC_WORKER_API_URL và chạy Worker API trước." : cause instanceof Error ? cause.message : "Không xác minh được project." }); });
    return () => { active = false; };
  }, [ready, userId, projectId, getAccessToken]);

  const hubProjectUrl = projectId ? `${RESEARCH_HUB_URL}/projects/${encodeURIComponent(projectId)}` : `${RESEARCH_HUB_URL}/projects`;
  if (!ready) return <Gate tone="loading" title="Đang nhận phiên làm việc" text="Đang khôi phục project và xác minh tài khoản ResearchHub…" />;
  if (!projectId) return <Gate tone="info" title="Mở Writing Lab từ ResearchHub" text="Hãy chọn project trong ResearchHub rồi mở Writing Lab từ workspace đó." link={hubProjectUrl} />;
  if (!user) return <Gate tone={handoffFailed ? "error" : "info"} title={handoffFailed ? "Không nhận được phiên ResearchHub" : "Cần đăng nhập"} text={error || "Mở Writing Lab từ project trong ResearchHub để chuyển phiên."} link={hubProjectUrl} action={signIn} />;
  if (projectFailure?.key === verificationKey) return <Gate tone="error" title="Không mở được project" text={projectFailure.message} link={hubProjectUrl} action={signIn} />;
  if (verification?.key !== verificationKey) return <Gate tone="loading" title="Đang xác minh quyền project" text="Writing Lab đang kiểm tra project có thuộc tài khoản ResearchHub hiện tại hay không." />;
  return <>{children}</>;
}

function Gate({ title, text, link, action, tone = "info" }: { title: string; text: string; link?: string; action?: () => void; tone?: "loading" | "info" | "error" }) {
  const Icon = tone === "loading" ? LoaderCircle : tone === "error" ? AlertCircle : ShieldCheck;
  return <main className="gate"><section className={`gate-card gate-card--${tone}`} aria-busy={tone === "loading"} aria-live={tone === "loading" ? "polite" : undefined}>
    <div className="gate-card-heading"><span className="gate-mark" aria-hidden="true"><Icon size={21} /></span><div><p className="gate-eyebrow">HYPERDATALAB <span>/</span> RESEARCHHUB</p><h1>{title}</h1></div></div>
    <p className="gate-message">{text}</p>
    {tone === "loading" && <div className="gate-progress" role="status"><span className="gate-progress-track" aria-hidden="true"><span /></span><p>Đang kiểm tra quyền truy cập an toàn…</p></div>}
    {(link || action) && <div className="gate-actions">{link && <a className="button" href={link}>Mở ResearchHub</a>}{action && <button className="button secondary" onClick={action}>Đăng nhập SSO</button>}</div>}
  </section></main>;
}
