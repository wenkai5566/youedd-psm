import { useState, type ReactNode } from 'react';
import {
  CalendarCheck,
  ClipboardList,
  Grid,
  LogOut,
  Menu,
  Plus,
  Settings,
  Sparkles,
  X,
} from 'lucide-react';
import { APP_BRAND, NAV_LABELS } from '../constants/labels';
import type { AppView, BackendMode, StaffUser } from '../types/domain';

interface AppShellProps {
  activeView: AppView;
  onSelectView: (view: AppView) => void;
  onCreateBooking: () => void;
  todayActionCount: number;
  dirtyRoomCount: number;
  mode: BackendMode;
  user: StaffUser;
  onSignOut: () => Promise<void>;
  children: ReactNode;
}

const DESKTOP_NAV_ITEMS: Array<{
  id: AppView;
  icon: typeof Grid;
}> = [
  { id: 'timeline', icon: Grid },
  { id: 'today', icon: CalendarCheck },
  { id: 'bookings', icon: ClipboardList },
  { id: 'housekeeping', icon: Sparkles },
  { id: 'settings', icon: Settings },
];

const MOBILE_NAV_ITEMS: Array<{
  id: AppView;
  icon: typeof Grid;
}> = [
  { id: 'today', icon: CalendarCheck },
  { id: 'timeline', icon: Grid },
  { id: 'bookings', icon: ClipboardList },
  { id: 'housekeeping', icon: Sparkles },
];

export function AppShell({
  activeView,
  onSelectView,
  onCreateBooking,
  todayActionCount,
  dirtyRoomCount,
  mode,
  user,
  onSignOut,
  children,
}: AppShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="preno-shell">
      {/* Desktop / Tablet: Authentic Preno Slim 68px Dark Slate-Navy Icon Rail */}
      <aside className="preno-rail" aria-label="主導覽列">
        <button
          type="button"
          className="preno-rail-brand"
          title={APP_BRAND.title}
          onClick={() => onSelectView('timeline')}
        >
          <img
            src="./icons/icon-192.png"
            alt={APP_BRAND.title}
            className="preno-rail-logo"
          />
        </button>

        <nav className="preno-rail-nav">
          {DESKTOP_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            const badge =
              item.id === 'today' && todayActionCount > 0
                ? todayActionCount
                : item.id === 'housekeeping' && dirtyRoomCount > 0
                  ? dirtyRoomCount
                  : 0;

            return (
              <button
                key={item.id}
                id={`rail-nav-${item.id}`}
                type="button"
                className={`preno-rail-btn ${isActive ? 'active' : ''}`}
                onClick={() => onSelectView(item.id)}
              >
                <span className="preno-rail-icon-wrap">
                  <Icon size={20} strokeWidth={isActive ? 2.2 : 1.85} />
                  {badge > 0 && (
                    <span
                      className={`preno-rail-badge tabular-nums ${
                        item.id === 'housekeeping' ? 'is-amber' : ''
                      }`}
                    >
                      {badge}
                    </span>
                  )}
                </span>
                <span className="preno-rail-label">{NAV_LABELS[item.id]}</span>
              </button>
            );
          })}
        </nav>

        <div className="preno-rail-footer">
          <span
            className={`preno-sync-pip ${mode === 'demo' ? 'is-demo' : ''}`}
            title={
              mode === 'firebase'
                ? `雲端同步中｜${user.email}`
                : `本機預覽｜${user.email}`
            }
          />
          <button
            id="btn-desktop-signout"
            type="button"
            className="preno-rail-btn preno-rail-signout"
            title={`登出（${user.email}）`}
            aria-label="登出系統"
            onClick={() => void onSignOut()}
          >
            <LogOut size={18} />
            <span className="preno-rail-label">登出</span>
          </button>
        </div>
      </aside>

      {/* Main Content Workspace */}
      <div className="preno-main">
        {/* Mobile Only: Authentic Preno Dark Slate-Navy Top Header */}
        <header className="preno-mobile-header">
          <button
            id="btn-mobile-menu"
            type="button"
            className="preno-mobile-header-btn"
            aria-label="開啟設定選單"
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu size={22} />
          </button>

          <h1 className="preno-mobile-title">{NAV_LABELS[activeView]}</h1>

          <button
            id="btn-mobile-add-booking"
            type="button"
            className="preno-mobile-add-btn"
            aria-label="新增訂房"
            onClick={onCreateBooking}
          >
            <Plus size={20} strokeWidth={2.5} />
          </button>
        </header>

        <main className="preno-workspace">{children}</main>
      </div>

      {/* Mobile Bottom 4-Tab Bar (Pure White, Thin Top Hairline, Teal Active) */}
      <nav className="preno-mobile-tabs" aria-label="行動版底部導覽">
        {MOBILE_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          const badge =
            item.id === 'housekeeping' && dirtyRoomCount > 0
              ? dirtyRoomCount
              : 0;
          return (
            <button
              key={item.id}
              id={`mobile-tab-${item.id}`}
              type="button"
              className={`preno-mobile-tab ${isActive ? 'active' : ''}`}
              onClick={() => onSelectView(item.id)}
            >
              <span className="preno-mobile-tab-icon">
                <Icon size={21} strokeWidth={isActive ? 2.2 : 1.8} />
                {badge > 0 && <span className="preno-mobile-dot" />}
              </span>
              <span>{NAV_LABELS[item.id]}</span>
            </button>
          );
        })}
      </nav>

      {/* Mobile Left Slide Menu (Settings & Account) */}
      {mobileMenuOpen && (
        <div
          className="drawer-backdrop drawer-backdrop-left"
          role="dialog"
          aria-modal="true"
          aria-label="系統選單"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMobileMenuOpen(false);
          }}
        >
          <aside className="preno-mobile-drawer">
            <div className="preno-mobile-drawer-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <img
                  src="./icons/icon-192.png"
                  alt={APP_BRAND.title}
                  className="preno-rail-logo"
                />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>
                    {APP_BRAND.shortTitle}
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.68)' }}>
                    {user.email}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="preno-mobile-header-btn"
                aria-label="關閉選單"
                onClick={() => setMobileMenuOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="preno-mobile-drawer-list">
              <button
                type="button"
                className={`preno-mobile-drawer-item ${
                  activeView === 'settings' ? 'active' : ''
                }`}
                onClick={() => {
                  onSelectView('settings');
                  setMobileMenuOpen(false);
                }}
              >
                <Settings size={18} />
                <span>房型、特殊假日與白名單設定</span>
              </button>

              <button
                type="button"
                className="preno-mobile-drawer-item is-danger"
                onClick={() => {
                  setMobileMenuOpen(false);
                  void onSignOut();
                }}
              >
                <LogOut size={18} />
                <span>登出系統</span>
              </button>
            </div>

            <div className="preno-mobile-drawer-foot">
              <span
                className={`preno-sync-pip ${mode === 'demo' ? 'is-demo' : ''}`}
              />
              <span>
                {mode === 'firebase'
                  ? 'Cloud Firestore 即時同步中'
                  : '本機預覽模式'}
              </span>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
