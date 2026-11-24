"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, ClipboardCheck, FileClock, Gauge, Home, LogOut, Moon, PanelLeftClose, PanelLeftOpen, Pencil, Search, Settings, Sun, Wand2, type LucideIcon } from "lucide-react";
import { useAuth } from "@/shared/auth/authContext";

const writingLinks = [
  ["/evaluate", "Đánh giá", ClipboardCheck],
  ["/revise", "Chỉnh sửa", Pencil],
  ["/generate", "Soạn đoạn", Wand2],
] as const;
const dataLinks = [
  ["/history", "Lịch sử viết", FileClock],
  ["/calibration", "Hiệu chuẩn", Gauge],
] as const;
const commands = [
  { href: "/", label: "Trang chủ", group: "Workspace" },
  { href: "/evaluate", label: "Đánh giá paragraph", group: "Viết" },
  { href: "/revise", label: "Chỉnh sửa có kiểm soát", group: "Viết" },
  { href: "/generate", label: "Soạn paragraph", group: "Viết" },
  { href: "/history", label: "Lịch sử viết", group: "Dữ liệu" },
  { href: "/calibration", label: "Hiệu chuẩn", group: "Dữ liệu" },
  { href: "/settings", label: "Cài đặt", group: "Hệ thống" },
];
const routeLabels: Record<string, string> = {
  "/": "Trang chủ", "/evaluate": "Đánh giá", "/revise": "Chỉnh sửa", "/generate": "Soạn đoạn",
  "/history": "Lịch sử viết", "/calibration": "Hiệu chuẩn", "/settings": "Cài đặt",
  "/report": "Báo cáo", "/compare": "So sánh",
};

function NavigationGroup({ title, links, pathname, collapsed }: {
  title: string;
  links: ReadonlyArray<readonly [string, string, LucideIcon]>;
  pathname: string;
  collapsed: boolean;
}) {
  return <section className="nav-group" aria-label={title}>
    {!collapsed && <h2 className="nav-section-label">{title}</h2>}
    {links.map(([href, label, Icon]) => <Link key={href} href={href}
      className={pathname === href ? "nav-link active" : "nav-link"}
      aria-current={pathname === href ? "page" : undefined} title={collapsed ? label : undefined}>
      <Icon size={17} strokeWidth={1.8} aria-hidden="true" /><span>{label}</span>
    </Link>)}
  </section>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, signOut, projectId } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const results = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return commands.filter((item) => !query || `${item.label} ${item.group}`.toLocaleLowerCase().includes(query));
  }, [search]);

  useEffect(() => {
    try {
      document.documentElement.dataset.theme = localStorage.getItem("writing-lab-theme") === "dark" ? "dark" : "light";
    } catch { document.documentElement.dataset.theme = "light"; }
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    searchInput.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [searchOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); setSearchOpen(true);
      }
      if (event.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const currentTitle = routeLabels[pathname] ?? "Workspace";
  const initials = user?.name?.[0] ?? user?.email[0]?.toUpperCase() ?? "U";
  function toggleTheme() {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("writing-lab-theme", next); } catch { /* Storage may be unavailable. */ }
  }
  return <div className="app-frame">
    <div className={`app-body${collapsed ? " sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-brand-row">
          <Link href="/" className="brand" aria-label="Writing Lab">
            <Image className="brand-mark" src="/hyperdatalab-r-mark.png" alt="" width={38} height={38} priority />
            <span className="brand-name">Writing Lab</span>
          </Link>
          <button className="collapse-button" onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? "Mở rộng thanh bên" : "Thu gọn thanh bên"} aria-expanded={!collapsed} title={collapsed ? "Mở rộng" : "Thu gọn"}>
            {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
        </div>
        <nav className="sidebar-nav" aria-label="Điều hướng Writing Lab">
          <section className="nav-group" aria-label="Workspace">
            {!collapsed && <h2 className="nav-section-label">Workspace</h2>}
            <Link href="/" className={pathname === "/" ? "nav-link active" : "nav-link"} aria-current={pathname === "/" ? "page" : undefined} title={collapsed ? "Trang chủ" : undefined}>
              <Home size={17} strokeWidth={1.8} aria-hidden="true" /><span>Trang chủ</span>
            </Link>
          </section>
          <NavigationGroup title="Viết" links={writingLinks} pathname={pathname} collapsed={collapsed} />
          <NavigationGroup title="Dữ liệu" links={dataLinks} pathname={pathname} collapsed={collapsed} />
        </nav>
        <div className="sidebar-footer">
          <Link href="/settings" className={pathname === "/settings" ? "nav-link active" : "nav-link"} aria-current={pathname === "/settings" ? "page" : undefined} title={collapsed ? "Cài đặt" : undefined}>
            <Settings size={17} strokeWidth={1.8} aria-hidden="true" /><span>Cài đặt</span>
          </Link>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-inner">
            <nav className="breadcrumbs" aria-label="Breadcrumb">
              <Link href="/">Writing Lab</Link><ChevronRight size={14} aria-hidden="true" /><strong>{currentTitle}</strong>
              {projectId && <span className="breadcrumb-project">Project {projectId.slice(0, 8)}</span>}
            </nav>
            <div className="topbar-right">
              <button className="command-search-trigger" type="button" onClick={() => setSearchOpen(true)} aria-haspopup="dialog" aria-label="Mở tìm kiếm nhanh">
                <Search size={16} aria-hidden="true" /><span>Tìm hoặc chạy lệnh…</span>
                <kbd>Ctrl K</kbd>
              </button>
              {searchOpen && createPortal(<div className="command-modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) { setSearchOpen(false); setSearch(""); } }}>
                <section className="command-modal" role="dialog" aria-modal="true" aria-labelledby="command-modal-title">
                  <h2 id="command-modal-title" className="visually-hidden">Tìm hoặc chạy lệnh</h2>
                  <div className="command-modal-input"><Search size={19} aria-hidden="true" />
                    <input ref={searchInput} aria-label="Tìm hoặc chạy lệnh" aria-controls="command-results" role="combobox" aria-expanded="true" aria-autocomplete="list" value={search}
                      placeholder="Tìm trang hoặc công cụ…" onChange={(event) => setSearch(event.target.value)}
                      onKeyDown={(event) => { if (event.key === "Escape") { setSearchOpen(false); setSearch(""); } }} />
                    <kbd>ESC</kbd>
                  </div>
                  <div className="command-results" id="command-results" role="listbox" aria-label="Điều hướng nhanh">
                  {results.length ? results.map((item) => <Link href={item.href} role="option" key={item.href}
                    onClick={() => { setSearchOpen(false); setSearch(""); }}>
                    <span>{item.label}</span><small>{item.group}</small>
                  </Link>) : <p>Không tìm thấy công cụ phù hợp.</p>}
                  </div>
                  <footer className="command-modal-footer"><span>Dùng tìm kiếm để mở nhanh một khu vực</span><button type="button" onClick={() => { setSearchOpen(false); setSearch(""); }}>Đóng</button></footer>
                </section>
              </div>, document.body)}
              <div className="account-summary" title={user?.email}>
                <span className="account-avatar">{initials}</span><span>{user?.name ?? user?.email}</span>
              </div>
              <Link className="header-icon-button" href="/settings" aria-label="Cài đặt" title="Cài đặt"><Settings size={17} /></Link>
              <button className="header-icon-button theme-toggle" onClick={toggleTheme} aria-label="Đổi giao diện sáng/tối" title="Đổi giao diện sáng/tối"><Sun className="theme-sun" size={18} /><Moon className="theme-moon" size={18} /></button>
              <button className="header-icon-button signout-icon" onClick={() => void signOut()} aria-label="Đăng xuất" title="Đăng xuất"><LogOut size={16} /></button>
            </div>
          </div>
        </header>
        <main className="main-content">{children}</main>
      </div>
    </div>
  </div>;
}
