import { useState, type FormEvent } from 'react';
import {
  Cloud,
  Plus,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Trash2,
} from 'lucide-react';
import { normalizeEmail } from '../domain/bookingLogic';
import type {
  AccessControlConfig,
  BackendMode,
  StaffUser,
} from '../types/domain';

interface TeamAccessViewProps {
  mode: BackendMode;
  currentUser: StaffUser;
  accessConfig: AccessControlConfig;
  onUpdateAllowedEmails: (emails: string[]) => Promise<void>;
  onResetDemoData?: () => Promise<void>;
}

export function TeamAccessView({
  mode,
  currentUser,
  accessConfig,
  onUpdateAllowedEmails,
  onResetDemoData,
}: TeamAccessViewProps) {
  const [newEmail, setNewEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const emails = accessConfig.allowedEmails;

  const handleAddEmail = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const cleaned = normalizeEmail(newEmail);
    if (!cleaned || !cleaned.includes('@')) {
      setError('請輸入有效的 Google 電子郵件地址');
      return;
    }
    if (emails.includes(cleaned)) {
      setError('此帳號已在授權白名單內');
      return;
    }
    try {
      setBusy(true);
      await onUpdateAllowedEmails([...emails, cleaned]);
      setNewEmail('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '新增授權帳號失敗');
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveEmail = async (target: string) => {
    if (target === currentUser.email) {
      setError('無法移除目前正在登入中的自己的帳號，避免鎖定系統');
      return;
    }
    if (!window.confirm(`確定要移除「${target}」的存取權限嗎？`)) {
      return;
    }
    try {
      setBusy(true);
      setError(null);
      await onUpdateAllowedEmails(emails.filter((e) => e !== target));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-grid" aria-label="團隊授權與系統設定">
      {/* Staff Whitelist Manager */}
      <div className="preno-section-block">
        <div className="preno-block-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={19} color="var(--brand-teal)" />
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>
              工作人員 Google 帳號白名單
            </h2>
          </div>
          <span className="pill pill-teal tabular-nums">
            共 {emails.length} 位授權成員
          </span>
        </div>

        <p style={{ fontSize: 13.5, color: 'var(--ink-secondary)' }}>
          僅限已加入白名單之 Google Email 存取本系統（無人數上限）。未授權帳號將由前端與 Cloud Firestore 安全規則雙重阻擋。
        </p>

        {error && <div className="alert-box alert-danger">{error}</div>}

        <div className="preno-flat-list">
          {emails.map((email) => (
            <div key={email} className="preno-flat-row">
              <div>
                <div style={{ fontWeight: 600, fontSize: 14.5 }}>{email}</div>
                {email === currentUser.email && (
                  <span style={{ fontSize: 12, color: 'var(--brand-teal)', fontWeight: 600 }}>
                    目前登入帳號
                  </span>
                )}
              </div>

              <button
                type="button"
                className="btn btn-ghost btn-icon"
                title="移除授權"
                aria-label={`移除 ${email}`}
                disabled={busy || email === currentUser.email}
                onClick={() => void handleRemoveEmail(email)}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>

        <form
          onSubmit={(e) => void handleAddEmail(e)}
          style={{ display: 'flex', gap: 8, marginTop: 12 }}
        >
          <input
            id="input-add-staff-email"
            type="email"
            className="input"
            placeholder="輸入團隊成員 Google Email..."
            value={newEmail}
            disabled={busy}
            onChange={(e) => setNewEmail(e.target.value)}
          />
          <button
            id="btn-add-staff-email"
            type="submit"
            className="btn btn-primary"
            disabled={busy}
          >
            <Plus size={16} />
            新增
          </button>
        </form>
      </div>

      {/* System Sync Status & Mobile PWA Guide */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="preno-section-block">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Cloud size={19} color="var(--brand-teal)" />
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>雲端同步與部署狀態</h2>
          </div>

          <div
            className={`alert-box ${
              mode === 'firebase' ? 'alert-info' : 'alert-warn'
            }`}
          >
            {mode === 'firebase' ? (
              <div>
                <strong>已連線至 Cloud Firestore 雲端資料庫</strong>
                <div style={{ fontSize: 12.5, marginTop: 3 }}>
                  跨手機與桌機即時同步啟用中，並支援離線快取與每晚房鎖防重複訂房。
                </div>
              </div>
            ) : (
              <div>
                <strong>目前為本機即時預覽模式（尚未填入 Firebase 金鑰）</strong>
                <div style={{ fontSize: 12.5, marginTop: 3 }}>
                  同瀏覽器多分頁可即時同步測試。正式上線請複製 <code>.env.example</code> 為{' '}
                  <code>.env</code> 並填入 Firebase 設定，同時部署 <code>firestore.rules</code>。
                </div>
              </div>
            )}
          </div>

          {onResetDemoData && (
            <button
              id="btn-reset-demo-data"
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                if (window.confirm('確定要重設為預設房型與展示訂房紀錄嗎？')) {
                  void onResetDemoData();
                }
              }}
            >
              <RotateCcw size={15} />
              重設展示資料
            </button>
          )}
        </div>

        <div className="preno-section-block">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Smartphone size={19} color="var(--brand-teal)" />
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>手機加入主畫面（App 模式）</h2>
          </div>
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              fontSize: 13.5,
              color: 'var(--ink-secondary)',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <li>
              <strong>iPhone（Safari）</strong>：點擊底部「分享」按鈕 → 選擇「加入主畫面」，即可從桌面以全螢幕 App 開啟。
            </li>
            <li>
              <strong>Android（Chrome）</strong>：點擊右上角選單 → 選擇「安裝應用程式」或「加到主畫面」。
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
