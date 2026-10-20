# Time Hunter

- 後台：<https://iammeg-sudo.github.io/Time-Hunter/admin.html>
- 前台：由後台「複製連結」取得（`https://iammeg-sudo.github.io/Time-Hunter/index.html?s=調查代碼`）

會議時間調查工具：管理者建立調查 → 傳連結給同事 → 同事用電腦或手機勾選可出席時段 → 後台即時統計 → 複製會議通知信。

| 頁面 | 網址 | 誰用 |
|---|---|---|
| 前台 | `index.html?s=<調查ID>` | 與會同事（點連結 → 點自己名字 → 勾時段 → 送出） |
| 後台 | `admin.html` | 管理者（需登入，且 email 在管理者名單內） |

> 尚未設定 Firebase 時，網站會以 **示範模式** 運作：資料只存在自己的瀏覽器，後台輸入任意 email 即可進入，方便先試用。

---

## 架構：為什麼需要 Firebase？

GitHub Pages 只能放「靜態網頁」，沒有地方存大家的回覆。所以：

- **GitHub Pages**：放網頁檔案（免費）
- **Firebase Firestore**：雲端資料庫，存調查與回覆，並**即時同步**到所有人的畫面（免費額度：每天 5 萬次讀取、2 萬次寫入，公司內部使用綽綽有餘）
- **Firebase Authentication**：管理者帳號登入

---

## 設定步驟（約 20 分鐘）

### 步驟 1：建立 Firebase 專案

1. 到 <https://console.firebase.google.com/> 用 Google 帳號登入
2. 「建立專案」→ 名稱輸入 `time-hunter` → Google Analytics 可關閉 → 建立

### 步驟 2：開啟資料庫 Firestore

1. 左側選單「產品類別 → 資料庫和儲存空間 → Firestore」（或「專案捷徑 → Firestore」）→「建立資料庫」
2. 版本選 **Standard**；資料庫 ID 保留 `(default)`；位置選 **asia-east1（台灣）**
3. 選「以**正式版模式**啟動」→ 建立
4. 進入「**規則**」分頁，把本專案 [`firestore.rules`](firestore.rules) 的內容**整個貼上取代** →「發布」

### 步驟 3：開啟管理者登入

1. 左側「產品類別 → 安全性 → Authentication」→「開始使用」
2. 「登入方式」→ 選「**電子郵件/密碼**」→ 啟用 → 儲存
3. 「使用者」分頁 →「新增使用者」→ 輸入管理者 email 與密碼（每位管理者都要新增一個）

### 步驟 4：把管理者加入名單

只有登入帳號還不夠，還要加入 `admins` 名單才能進後台（避免任何人註冊就能看資料）。

1. 回到「Firestore Database → 資料」
2. 「開始集合」→ 集合 ID 輸入 `admins`
3. 文件 ID 輸入管理者的 email（**全小寫**，例如 `megpp2004@gmail.com`）
4. 欄位隨意加一個，例如 `name`（字串）= 管理者名字 → 儲存
5. 在這份文件再「新增欄位」：欄位 `super`、類型 `boolean`、值 `true` → 這位就是**最高管理者**
6. 第一位最高管理者設定好之後，**其他管理者不用再到 Firebase 新增**，改用下面的「新增其他管理者」

### 管理者身分

| 身分 | 權限 |
|---|---|
| 最高管理者 | 刪除任何人的調查、新增／移除管理者、設定其他最高管理者 |
| 管理者 | 建立與編輯調查，只能刪除自己建立的調查 |

### 新增其他管理者（在後台操作）

1. 以**最高管理者**登入後台 → 左側「**管理者**」
2. 在「新增管理者」貼上名單（一行一位：`姓名, email`，或只貼 email）→「加入管理者」
3. 按「複製邀請說明」或「開啟郵件」通知同事
4. 同事到登入頁點「**第一次使用？設定密碼**」，用自己的公司 email 設定密碼即可登入；忘記密碼可點「忘記密碼」自行重設
5. 只有名單內的 email 能進後台；要取消權限，在同一頁按垃圾桶移除（不能移除自己）
6. 按「設為最高／取消最高」可變更其他人的身分（不能取消自己的最高管理者身分）

### 步驟 5：取得網站設定碼

1. 專案總覽旁的齒輪「專案設定」→「一般」→ 往下到「你的應用程式」→ 點 `</>`（網頁）圖示
2. 暱稱輸入 `time-hunter` →「註冊應用程式」（不用勾 Hosting）
3. 畫面會出現一段 `firebaseConfig = { apiKey: ..., ... }`
4. 把這些值貼到本專案的 [`assets/js/config.js`](assets/js/config.js) 取代 `YOUR_API_KEY` 等內容

> `apiKey` 放在公開網站上是正常的，Firebase 的安全性是靠步驟 2 的「規則」控管，不是靠隱藏金鑰。

### 步驟 6：上傳到 GitHub 並開啟 GitHub Pages

1. 到 <https://github.com/new> 建立 repository，例如 `time-hunter`，設為 **Public**（免費帳號的 Pages 需要 Public）
2. 在新 repo 頁面點「uploading an existing file」，把整個 `Time Hunter` 資料夾內的檔案（`index.html`、`admin.html`、`assets` 資料夾、`.nojekyll` 等）拖進去 →「Commit changes」
   - `.claude` 資料夾不用上傳
3. repo 的「Settings → Pages」→ Source 選「Deploy from a branch」→ Branch 選 `main`、`/ (root)` → Save
4. 等 1～2 分鐘，網址會是：`https://<你的GitHub帳號>.github.io/time-hunter/`

### 步驟 7：允許 GitHub 網域登入

1. 回 Firebase「Authentication → 設定 → 授權網域」
2. 「新增網域」→ 輸入 `<你的GitHub帳號>.github.io`

完成！後台網址：`https://<你的GitHub帳號>.github.io/time-hunter/admin.html`

---

## 使用流程

1. **後台 → 名單**：先建好常用名單（如「產品部」），格式一行一位 `姓名, email`，可直接從 Excel 複製兩欄貼上
2. **後台 → 新增**：輸入會議名稱、地點、截止時間 → 加入日期（每天可選上午／下午／自訂時段）→ 匯入名單 →「建立調查」
3. **調查頁 → 信件 →「邀請」**：複製收件人、主旨、內文寄出（或按「開啟郵件」直接帶入 Outlook）
4. 同事點連結填寫；後台的排行、矩陣、未回覆名單**即時更新**
5. 快截止時用「**催填**」：收件人只會列出還沒回覆的人
6. 截止後用「**通知**」：選定時段（預設為最高票）→ 複製會議通知信

其他：
- 可「提前截止」或「重新開放」；過了截止時間前台就無法再修改
- 總覽頁顯示一年內的所有調查，可依「進行中／已截止」篩選與搜尋
- 編輯調查時，同名的與會者會保留原本的回覆

---

## 之後要修改網站

修改檔案後，到 GitHub repo 點對應檔案 → 鉛筆圖示編輯，或「Add file → Upload files」上傳覆蓋，約 1 分鐘後網站自動更新。資料都在 Firebase，更新網頁不會影響已有的調查與回覆。

## 檔案說明

```
index.html            前台
admin.html            後台
assets/css/front.css  前台樣式
assets/css/admin.css  後台樣式
assets/js/config.js   Firebase 設定（步驟 5 要填）
assets/js/store.js    資料存取（Firebase / DEMO）
assets/js/front.js    前台邏輯
assets/js/admin.js    後台邏輯
assets/js/utils.js    共用工具、信件範本
firestore.rules       資料庫安全規則（步驟 2 要貼）
```
