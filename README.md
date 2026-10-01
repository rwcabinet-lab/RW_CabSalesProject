# 系統櫃工廠業務報價與案件時程追蹤系統

這個專案是一個以 Next.js 為核心的業務管理系統，目標是協助系統櫃／櫥櫃工廠將「客戶管理、案場進度、時程追蹤、任務派工與報價登記」集中在一個平台中。

目前專案已具備可運作的資料層、API 路由與主要業務頁面，適合拿來做內部 demo、流程驗證與後續 ERP 擴充的基礎。

---

## 專案現況

目前版本屬於「內部測試 / 演示版」而非正式上線系統，重點已落在以下幾個區塊：

- 客戶主檔管理
- 案場建立與編輯
- 自動產生里程碑與進度推進
- 業務待辦任務管理
- 外部報價單登記
- 主管看板與視覺化檢視
- Prisma + Supabase PostgreSQL 的資料持久化

目前仍然沒有正式的登入系統與角色權限控管，預覽模式使用固定使用者 ID 直接載入資料，適合開發/演示使用。

---

## 主要功能

### 1. 客戶與業務資料管理

- 管理客戶類型：隆美店面、櫥櫃工廠、設計公司、經銷公司、營造建設、連工帶料、個人客戶
- 記錄統編、電話、地址、預設折率與付款條件
- 綁定業務負責人
- 可在工作台中快速選擇客戶建立案場

### 2. 案場與里程碑管理

- 建立案場、填寫施工地點、預計完工日與基本金額資訊
- 系統可自動產生固定序列的里程碑
- 支援里程碑狀態：待處理、進行中、已完成、逾期
- 可更新附件、備註與實際完成日
- 支援快速推進目前里程碑，並同步更新專案階段

### 3. 業務待辦事項

- 建立待辦任務：現場丈量、圖面、報價追蹤、請款提醒等
- 可指定負責人與到期時間
- 支援標記完成與補充完成備註
- 一般用於業務工作台的每日追蹤

### 4. 報價登記

- 以專案為單位維護報價版本
- 記錄外部報價單號、附件連結、版本、總金額與狀態
- 目前這部分以「外部報價結果登記」為主，不再在本系統進行詳細材料拆解與成本計算

### 5. 主管監控與視覺化

- 主管看板可檢視案件進度與逾期狀態
- 提供 Kanban、甘特圖與行事曆檢視模式
- 可快速掌握專案當前階段與待辦事項

---

## 技術棧

- Framework: Next.js 14 (App Router)
- Language: TypeScript
- UI: React 18 + Tailwind CSS
- Data layer: Prisma ORM
- Database: Supabase PostgreSQL
- Visualization: Recharts + Kanban / calendar style UI components
- State: React Query + Zustand
- Icons: lucide-react

資料流向大致為：

API Route → DataService → Prisma Client → Supabase PostgreSQL

---

## 目前主要頁面

- `/`：首頁／專案入口
- `/customers`：客戶主檔
- `/dashboard/workbench`：業務工作台，新增案場、任務與快速推進
- `/dashboard/manager`：主管看板
- `/projects/[id]/milestones`：里程碑與進度回報
- `/projects/[id]/quote`：報價版本記錄
- `/views`：視覺化檢視頁（Kanban / Gantt / Calendar）

---

## 專案結構

```text
.
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── src/
│   ├── app/
│   │   ├── api/
│   │   ├── customers/
│   │   ├── dashboard/
│   │   ├── projects/
│   │   ├── views/
│   │   └── page.tsx
│   ├── components/
│   ├── lib/
│   │   ├── current-user.ts
│   │   ├── data-service.ts
│   │   ├── mock-data.ts
│   │   ├── prisma.ts
│   │   ├── schedule-engine.ts
│   │   └── seed-supabase.ts
│   └── ...
├── docker-compose.yml
├── package.json
├── tailwind.config.ts
├── tsconfig.json
├── next-env.d.ts
├── postcss.config.mjs
└── README.md
```

---

## 環境設定

### 1. 安裝依賴

```bash
npm install
```

### 2. 建立環境變數

在專案根目建立 `.env.local`，並填入 Supabase 連線資訊：

```env
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres"
NODE_ENV="development"
```

說明：

- `DATABASE_URL`：供應用程式在執行時連接資料庫
- `DIRECT_URL`：供 Prisma schema / migration / generate 使用
- 若密碼含有特殊字元，請先做 URL encoding
- `.env.local` 不應提交至 Git

### 3. Prisma 驗證與生成

```bash
npx prisma validate
npx prisma generate
```

如果是全新資料庫，可先同步 schema：

```bash
npx prisma db push
```

若已經有完整 migration，可以使用：

```bash
npx prisma migrate deploy
```

既有 Supabase 資料庫若已使用 `prisma db push` 建立，請套用新增客戶類型的 migration，或執行 `npx prisma db push` 同步 schema。舊資料中的 `CONTRACTOR` 仍會保留，畫面選項則使用新的客戶類型。

### 4. 建立開發資料

```bash
npm run prisma:seed
```

這個指令會重建開發資料，包含測試使用者、客戶、案場、里程碑、任務與報價，適合在本地或開發資料庫中使用。請勿在正式環境直接執行。

若要開啟 Prisma Studio：

```bash
npm run prisma:studio
```

---

## 啟動專案

```bash
npm run dev
```

預設會啟動 Next.js 開發伺服器，若 `3000` 已被占用，會自動切換到其他可用 port。

---

## 開發檢查

```bash
npx prisma validate
npx tsc --noEmit
npm run build
```

建議在新增或修改資料模型時先執行 Prisma 驗證，再確認型別與建置能否通過。

---

## 預覽使用者

開啟 `/login` 後，使用者清單會從 Supabase `users` 表載入。登入密碼預設為 `0000`，登入後以 HttpOnly cookie 保存使用者身份；工作台篩選、客戶新增、案場新增與任務指派會使用目前登入者。

若要覆寫共用預覽密碼，可在伺服器環境設定 `LOGIN_PASSWORD`。此為簡易預覽登入，不等同完整的 Supabase Auth。

初始預覽使用者：

```text
ID: cmuf2wbfq000314yab0dvs2jo
角色: SALES
```

此使用者會在使用者清單載入時確保存在，其他使用者則直接從資料庫清單選取。

---

## 建議測試流程

1. 開啟 `/login`，選擇使用者並以預設密碼登入
2. 打開 `/customers` 建立一位客戶
3. 進入 `/dashboard/workbench` 建立新的案場
4. 輸入案場名稱、客戶、施工地址與預計完工日
5. 確認系統自動產生里程碑與初始狀態
6. 進入 `/projects/[id]/milestones` 完成第一個里程碑
7. 在 `/dashboard/workbench` 檢查待辦與進度更新
8. 在 Supabase 中確認 `customers`、`projects`、`project_milestones`、`quotations`、`sales_tasks` 是否更新

---

## 注意事項

- `npm run prisma:seed` 會直接重置資料庫內容，請勿在正式資料庫執行。
- 目前登入使用共用預覽密碼，正式上線前應改用 Supabase Auth 或企業身分驗證。
- 報價計算邏輯已被設計為「外部報價結果登記」，不是完整成本拆分系統。
- 若資料庫連線異常、讀取緩慢或顯示錯誤，先確認 `DATABASE_URL` / `DIRECT_URL` 是否正確，以及 Supabase 的 pooler / region 設定是否正常。

---

## 未來擴充方向

這個專案的下一步可延伸到：

- 真正的使用者登入與角色權限
- 主管審核與簽核流程
- 更完整的財務模組（成本、毛利、立帳、發票）
- 文件上傳 / 附件儲存整合
- API / Webhook 與外部報價系統串接
- 更完整的 KPI 儀表板與匯出功能

這份 README 以目前實際程式碼狀態為準，未來隨著功能發展可再同步更新。
