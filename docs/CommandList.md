# 常用指令清單 (Command List)

## 1. 環境架設與相依性安裝 (Setup & Install)

### 前端 (Frontend)
```bash
cd frontend
npm install
```

### 後端 (Backend)
```bash
# 建立虛擬環境 (Python 3.10+)
python -m venv .venv

# 啟用虛擬環境 (Windows PowerShell)
.venv\Scripts\Activate.ps1
# 啟用虛擬環境 (Windows CMD)
.venv\Scripts\activate.bat
# 啟用虛擬環境 (Mac/Linux)
source .venv/bin/activate

# 安裝後端套件
pip install -r backend/requirements.txt
```

---

## 2. 啟動開發伺服器 (Run Dev Servers)

### 後端 API 伺服器 (Flask)
建議在虛擬環境啟用狀態下執行：
```bash
python backend/app.py
```

### 前端 App (Expo)
```bash
cd frontend
# 啟動 Expo (預設，適用於同區網或模擬器)
npx expo start

# 啟動 Expo (Tunnel 模式，適用於跨網段、實機測試)
npx expo start --tunnel

# 清除快取並重新啟動 Expo
npx expo start -c
```

### 常見問題處理
```bash
# 關閉佔用 8081 Port 的 Expo 伺服器
npx kill-port 8081
```

---

## 3. 專案檢查與測試 (Verification & Testing)

### 後端單元測試與驗證
```bash
# 執行後端單元測試
python -m unittest discover backend/tests
# 或是使用 pytest
pytest backend/tests

# 後端語法檢查 (smoke check)
python -m py_compile "backend/app.py" "backend/repositories/storage.py" "backend/services/disease_rule_service.py" "backend/services/history_service.py" "backend/services/predict_service.py" "backend/services/recommend_service.py" "backend/services/healthy_food_service.py"

# YOLO 與 TFDA 映射關係驗證
python backend/scripts/verify_mapping.py
```

### 前端型別與風格檢查
```bash
cd frontend

# TypeScript 型別檢查
npm run typecheck

# 執行 ESLint 檢查
npx eslint .

# 執行 Prettier 程式碼格式化
npx prettier --write .
```

---

## 4. Git 常用操作 (Git Commands)

### 取得最新進度
```bash
# 從 GitHub 拉取最新程式碼並合併
git pull
```

### 分支管理
```bash
# 列出本機所有分支
git branch

# 切換到已存在的分支
git checkout <分支名稱>
# 或
git switch <分支名稱>

# 建立並直接切換到新分支 (基於當前分支)
git checkout -b <新分支名稱>
# 或
git switch -c <新分支名稱>
```

### 提交變更
```bash
# 暫存所有變更並建立 Commit
git add .
git commit -m "feat: 描述你做了什麼修改"
```
