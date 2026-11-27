import { LogOut, ShieldAlert, ShieldCheck } from 'lucide-react';
import { APP_BRAND } from '../constants/labels';
import type { DemoSignInAccount } from '../services/repository';
import type { BackendMode, StaffUser } from '../types/domain';

interface AuthGateProps {
  mode: BackendMode;
  user: StaffUser | null;
  authReady: boolean;
  isAuthorized: boolean;
  allowedEmails: string[];
  onSignInWithGoogle: (demoAccount?: DemoSignInAccount) => Promise<void>;
  onSignOut: () => Promise<void>;
}

export function AuthGate({
  mode,
  user,
  authReady,
  isAuthorized,
  allowedEmails,
  onSignInWithGoogle,
  onSignOut,
}: AuthGateProps) {
  if (!authReady) {
    return (
      <main className="auth-screen">
        <div className="auth-card" style={{ alignItems: 'center', textAlign: 'center' }}>
          <img
            src="./icons/icon-192.png"
            alt={APP_BRAND.title}
            className="auth-emblem"
          />
          <p className="auth-subtitle">正在驗證登入狀態...</p>
        </div>
      </main>
    );
  }

  /* Authenticated Google account that is NOT in the 5-email whitelist */
  if (user && !isAuthorized) {
    return (
      <main className="auth-screen">
        <section className="auth-card" aria-labelledby="access-denied-title">
          <div className="auth-brand-header">
            <img
              src="./icons/icon-192.png"
              alt={APP_BRAND.title}
              className="auth-emblem"
            />
            <h1 id="access-denied-title" className="auth-title">
              此帳號未獲得存取授權
            </h1>
            <p className="auth-subtitle">
              本系統僅限「{APP_BRAND.title}」已授權白名單之工作人員使用。
            </p>
          </div>

          <div className="alert-box alert-danger">
            <ShieldAlert size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong>已阻擋存取旅客與訂房資料</strong>
              <div style={{ marginTop: 4, fontSize: 13 }}>
                目前登入帳號：<code>{user.email}</code>
              </div>
              <div style={{ marginTop: 4, fontSize: 12.5 }}>
                如需開通權限，請聯繫民宿負責人將您的 Google Email 加入團隊白名單。
              </div>
            </div>
          </div>

          <button
            id="btn-signout-blocked"
            type="button"
            className="btn btn-primary btn-lg"
            onClick={() => void onSignOut()}
          >
            <LogOut size={17} />
            登出並切換其他 Google 帳號
          </button>
        </section>
      </main>
    );
  }

  /* Unauthenticated sign-in screen */
  return (
    <main className="auth-screen">
      <section className="auth-card" aria-labelledby="login-heading">
        <div className="auth-brand-header">
          <img
            src="./icons/icon-192.png"
            alt={APP_BRAND.title}
            className="auth-emblem"
          />
          <div>
            <h1 id="login-heading" className="auth-title">
              {APP_BRAND.title}
            </h1>
            <p className="auth-subtitle" style={{ marginTop: 4 }}>
              {APP_BRAND.subtitle}
            </p>
          </div>
        </div>

        <div className="alert-box alert-info">
          <ShieldCheck size={18} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            內部專用系統：請使用已列於白名單之 Google 帳號登入，所有旅客資料皆受權限規則嚴格保護並跨裝置即時同步。
          </div>
        </div>

        {mode === 'firebase' ? (
          <button
            id="btn-google-signin"
            type="button"
            className="google-btn"
            onClick={() => void onSignInWithGoogle()}
          >
            <GoogleColorIcon />
            使用 Google 帳號登入
          </button>
        ) : (
          <>
            <button
              id="btn-google-signin-demo"
              type="button"
              className="google-btn"
              onClick={() =>
                void onSignInWithGoogle({
                  email: allowedEmails[0] || 'owner@xinyue.tw',
                  displayName: '羅管家（負責人）',
                })
              }
            >
              <GoogleColorIcon />
              使用 Google 帳號登入（授權預覽）
            </button>

            <div className="demo-divider">本機預覽模式｜切換測試帳號</div>

            <div className="demo-account-list">
              <button
                id="btn-demo-staff-1"
                type="button"
                className="demo-account-btn"
                onClick={() =>
                  void onSignInWithGoogle({
                    email: allowedEmails[0] || 'owner@xinyue.tw',
                    displayName: '羅管家（負責人）',
                  })
                }
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>羅管家（負責人）</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-tertiary)' }}>
                    {allowedEmails[0] || 'owner@xinyue.tw'}
                  </div>
                </div>
                <span className="pill pill-confirmed">白名單授權</span>
              </button>

              <button
                id="btn-demo-staff-2"
                type="button"
                className="demo-account-btn"
                onClick={() =>
                  void onSignInWithGoogle({
                    email: allowedEmails[1] || 'frontdesk@xinyue.tw',
                    displayName: '林櫃檯（房務人員）',
                  })
                }
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>林櫃檯（房務人員）</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-tertiary)' }}>
                    {allowedEmails[1] || 'frontdesk@xinyue.tw'}
                  </div>
                </div>
                <span className="pill pill-confirmed">白名單授權</span>
              </button>

              <button
                id="btn-demo-unauthorized"
                type="button"
                className="demo-account-btn demo-account-blocked"
                onClick={() =>
                  void onSignInWithGoogle({
                    email: 'visitor.unlisted@gmail.com',
                    displayName: '未授權外部帳號',
                  })
                }
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>測試未授權 Google 帳號</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-tertiary)' }}>
                    visitor.unlisted@gmail.com
                  </div>
                </div>
                <span className="pill pill-cancelled">模擬阻擋</span>
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

function GoogleColorIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.54 5.54 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.54-5.17 3.54-8.87Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.94-2.91l-3.88-3c-1.07.72-2.45 1.16-4.06 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.29A7.22 7.22 0 0 1 4.9 12c0-.79.14-1.57.38-2.29V6.62H1.29A12 12 0 0 0 0 12c0 1.94.46 3.77 1.29 5.38l3.99-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.62l3.99 3.09c.95-2.85 3.6-4.96 6.72-4.96Z"
      />
    </svg>
  );
}
