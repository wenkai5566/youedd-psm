# 侑德心悅・侑德園｜內部訂房管理系統（Guesthouse Booking Management System）

專為 **拉拉山・侑德心悅、侑德園民宿**（最多 15 間房 / 5 位工作人員）設計的跨裝置內部訂房與房務管理 PWA Web App。

## 架構與技術選型

- **前端與 PWA**：React 19 + TypeScript + Vite + 原生 CSS Design Tokens，具備 `manifest.webmanifest`、Service Worker 及 iOS / Android 主畫面圖示。
- **雲端資料庫與即時同步**：Firebase Cloud Firestore（啟用離線快取 `persistentLocalCache` 與 `onSnapshot` 跨裝置即時同步）。
- **防重複訂房（Double-Booking Prevention）**：
  - 前端表單即時偵測並標記衝突房型。
  - 後端透過 Firestore Atomic Transaction（`runTransaction`）寫入每晚房鎖文件 `roomNightLocks/{roomId}_{YYYY-MM-DD}`，即使多名員工同時操作也絕不會重複訂房；取消訂房時原子釋放房鎖。
- **帳號白名單安全控管**：
  - Firebase Authentication（Google 登入）+ `firestore.rules` 資料庫層級強制驗證（上限 5 組已驗證 Google Email），未授權帳號無法讀取或寫入任何旅客資料。

## 本機開發與即時預覽

未建立 `.env` 時，系統會自動以 **本機即時預覽模式** 啟動（使用 `localStorage` + `BroadcastChannel` 跨分頁即時同步，並預載官網 [xinyue.tw](https://www.xinyue.tw/) 的 15 間房型與展示訂房）：

```bash
npm install
npm run dev
```

執行單元測試（驗證防重複訂房、平假日房價試算、尾款計算與白名單上限檢查）：

```bash
npm test
```

## 連接正式 Firebase 雲端資料庫

1. 於 [Firebase Console](https://console.firebase.google.com/) 建立專案。
2. 啟用 **Authentication → Sign-in method → Google**。
3. 建立 **Cloud Firestore** 資料庫（建議選擇 `asia-east1` 台灣區域）。
4. 編輯 [`firestore.rules`](./firestore.rules) 中的 `isInBootstrapWhitelist()`，填入最多 5 位工作人員的實際 Google Email，然後部署安全規則與索引：
   ```bash
   firebase deploy --only firestore:rules,firestore:indexes
   ```
5. 複製 `.env.example` 為 `.env` 並填入 Firebase Web App 金鑰與 `VITE_ALLOWED_STAFF_EMAILS`：
   ```bash
   cp .env.example .env
   ```
6. 建置並部署至 Firebase Hosting（或 Vercel / Cloudflare Pages）：
   ```bash
   npm run build
   firebase deploy --only hosting
   ```
