"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, ClipboardCheck, FileClock, FolderKanban, Gauge, Pencil, RefreshCw, Wand2 } from "lucide-react";
import { useWritingContext } from "@/modules/shared/useWritingContext";
import { useAuth } from "@/shared/auth/authContext";
import { writingRepository, type VersionedWritingRecord } from "@/shared/storage/writingRepository";

const tools = [
  { href: "/evaluate", title: "Đánh giá paragraph", description: "Xem luận điểm, bằng chứng và các điểm cần xem lại.", Icon: ClipboardCheck },
  { href: "/revise", title: "Chỉnh sửa có kiểm soát", description: "Chọn vấn đề cần xử lý và duyệt từng thay đổi.", Icon: Pencil },
  { href: "/generate", title: "Soạn từ claim và evidence", description: "Phát triển đoạn viết từ luận điểm và nguồn bạn cung cấp.", Icon: Wand2 },
  { href: "/history", title: "Lịch sử viết", description: "Mở lại các lần đánh giá, chỉnh sửa và soạn thảo.", Icon: FileClock },
] as const;

const kindLabels: Record<string, string> = {
  evaluation: "Đánh giá",
  revision: "Chỉnh sửa",
  generation: "Bản nháp",
  calibration: "Hiệu chuẩn",
};

function recordHref(item: VersionedWritingRecord) {
  if (item.record.kind === "revision") {
    const payload = item.record.payload as { evaluationId?: string };
    return `/compare?before=${encodeURIComponent(payload.evaluationId ?? "")}&after=${encodeURIComponent(item.record.id)}`;
  }
  return `/report?id=${encodeURIComponent(item.record.id)}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function HomeWorkspace() {
  const context = useWritingContext();
  const { user, projectId } = useAuth();
  const [records, setRecords] = useState<VersionedWritingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const displayName = user?.name?.trim().split(/\s+/).at(-1) || user?.email?.split("@")[0] || "bạn";

  useEffect(() => {
    let active = true;
    if (!context) return () => { active = false; };
    void Promise.resolve().then(async () => {
      if (!active) return;
      setLoading(true);
      setError("");
      try {
        const items = await writingRepository.listRecords(context);
        if (active) setRecords(items);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Không tải được lịch sử viết.");
      } finally {
        if (active) setLoading(false);
      }
    });
    return () => { active = false; };
  }, [context, reloadKey]);

  const recentRecords = records.slice(0, 5);
  const stats = [
    { label: "Tổng lượt làm việc", value: records.length, Icon: FolderKanban },
    { label: "Đánh giá", value: records.filter((item) => item.record.kind === "evaluation").length, Icon: ClipboardCheck },
    { label: "Chỉnh sửa", value: records.filter((item) => item.record.kind === "revision").length, Icon: Pencil },
    { label: "Bản nháp", value: records.filter((item) => item.record.kind === "generation").length, Icon: Wand2 },
  ];

  return <div className="home-dashboard">
    <header className="dashboard-heading">
      <div>
        <p className="dashboard-kicker">WRITING WORKSPACE <span aria-hidden="true">/</span> RESEARCHHUB</p>
        <h1>Chào bạn, {displayName}</h1>
        <p>Sẵn sàng tiếp tục viết và hoàn thiện paragraph của bạn?</p>
      </div>
      <div className="dashboard-actions">
        <Link className="secondary-button" href="/evaluate"><ClipboardCheck size={16} /> Đánh giá văn bản</Link>
        <Link className="primary-button" href="/generate"><Wand2 size={16} /> Soạn đoạn mới</Link>
      </div>
    </header>

    <section className="dashboard-tools" aria-label="Công cụ viết">
      {tools.map(({ href, title, description, Icon }) => <Link className="dashboard-tool" href={href} key={href}>
        <span className="dashboard-tool-icon"><Icon size={19} strokeWidth={1.8} /></span>
        <span className="dashboard-tool-copy"><strong>{title}</strong><span>{description}</span></span>
        <ArrowRight className="dashboard-tool-arrow" size={17} aria-hidden="true" />
      </Link>)}
    </section>

    <section className="dashboard-stats" aria-label="Thống kê hoạt động">
      {stats.map(({ label, value, Icon }) => <div className="dashboard-stat" key={label}>
        <span className="dashboard-stat-label"><Icon size={16} aria-hidden="true" />{label}</span>
        <strong>{loading || error || !context ? <span className="stat-loading" aria-label={loading ? "Đang tải" : "Chưa có dữ liệu"}>{loading ? "…" : "—"}</span> : value}</strong>
      </div>)}
    </section>

    <div className="dashboard-main-grid">
      <section className="dashboard-panel recent-panel">
        <div className="dashboard-panel-heading">
          <div><h2>Tiếp tục làm việc</h2><p>Các hoạt động gần đây trong project này.</p></div>
          <Link className="dashboard-inline-link" href="/history">Tất cả lịch sử <ArrowRight size={15} /></Link>
        </div>
        {error ? <div className="dashboard-empty" role="alert">
          <p>{error}</p><button className="secondary-button" onClick={() => setReloadKey((key) => key + 1)}><RefreshCw size={15} /> Thử lại</button>
        </div> : loading ? <div className="dashboard-loading" aria-label="Đang tải hoạt động">
          {[0, 1, 2].map((item) => <div className="loading-row" key={item}><span /><div><i /><i /></div></div>)}
        </div> : recentRecords.length ? <div className="recent-record-list">
          {recentRecords.map((item) => <Link className="recent-record" href={recordHref(item)} key={item.record.id}>
            <span className="recent-record-icon">{item.record.kind === "evaluation" ? <ClipboardCheck size={18} /> : item.record.kind === "revision" ? <Pencil size={18} /> : item.record.kind === "generation" ? <Wand2 size={18} /> : <Gauge size={18} />}</span>
            <span className="recent-record-copy"><strong>{item.record.title || "Chưa đặt tiêu đề"}</strong><span>{kindLabels[item.record.kind] ?? item.record.kind} · {formatDate(item.record.updatedAt)}</span></span>
            <ArrowRight className="recent-record-arrow" size={16} />
          </Link>)}
        </div> : <div className="dashboard-empty">
          <span className="dashboard-empty-icon"><FileClock size={21} /></span>
          <strong>Chưa có hoạt động viết</strong>
          <p>Bắt đầu bằng một lần đánh giá hoặc soạn paragraph. Các bản ghi sẽ xuất hiện ở đây.</p>
          <Link className="dashboard-inline-link" href="/evaluate">Bắt đầu đánh giá <ArrowRight size={15} /></Link>
        </div>}
      </section>

      <aside className="dashboard-side-column">
        <section className="dashboard-panel project-panel">
          <span className="project-panel-icon"><FolderKanban size={19} /></span>
          <div className="project-panel-heading"><h2>Project đang mở</h2><span className="project-status"><i /> Đã kết nối</span></div>
          <p className="project-id">{projectId ? `Project ${projectId.slice(0, 8)}` : "ResearchHub project"}</p>
          <p className="project-description">Nội dung và lịch sử được lưu riêng trong Firestore theo tài khoản và project.</p>
          <Link className="project-settings-link" href="/settings">Cài đặt workspace <ArrowRight size={15} /></Link>
        </section>
        <section className="dashboard-tip">
          <span className="tip-icon"><Gauge size={17} /></span>
          <div><strong>Giữ quyền quyết định</strong><p>Writing Lab làm rõ bằng chứng và đề xuất chỉnh sửa. Bạn luôn xem lại trước khi chấp nhận.</p></div>
        </section>
      </aside>
    </div>
  </div>;
}
