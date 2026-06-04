import requests
import json
from pymongo import MongoClient

BACKEND_URL = "http://127.0.0.1:5000"

def test_auth():
    print("--- 1. 測試帳號註冊 ---")
    test_email = "testuser@example.com"
    test_password = "SecurePassword123"
    test_name = "測試人員"

    # 先確保資料庫中乾淨
    try:
        client = MongoClient("mongodb://localhost:27017", serverSelectionTimeoutMS=2000)
        client.nutrilens.auth_users.delete_many({"email": test_email})
        client.nutrilens.users.delete_many({"name": test_name})
        print("[✓] 成功清理 MongoDB 舊資料")
    except Exception as e:
        print(f"[!] 無法連結 MongoDB 進行清理，將直接發送 API: {e}")

    # 1. 註冊
    reg_res = requests.post(f"{BACKEND_URL}/api/auth/register", json={
        "email": test_email,
        "password": test_password,
        "name": test_name
    })
    
    if reg_res.status_code == 201:
        reg_data = reg_res.json()
        print(f"[✓] 註冊成功，回傳 userId: {reg_data.get('user_id')}")
        print(f"[✓] 回傳 token: {reg_data.get('token')[:30]}...")
    else:
        print(f"[✗] 註冊失敗: {reg_res.status_code} - {reg_res.text}")
        return

    # 2. 檢查 MongoDB 中的密碼是否雜湊
    try:
        auth_doc = client.nutrilens.auth_users.find_one({"email": test_email})
        if auth_doc:
            pwd_hash = auth_doc.get("password_hash")
            print(f"[✓] MongoDB 內已寫入使用者，密碼雜湊為: {pwd_hash}")
            if pwd_hash == test_password:
                print("[✗] 錯誤：密碼以明文存儲！")
            else:
                print("[✓] 安全驗證：密碼已成功以 Bcrypt 加密雜湊儲存")
        else:
            print("[✗] 在 MongoDB 中找不到該使用者帳密紀錄")
    except Exception as e:
        print(f"[!] 讀取 MongoDB 驗證雜湊失敗: {e}")

    # 3. 測試登入 (正確密碼)
    print("\n--- 2. 測試正確密碼登入 ---")
    login_res = requests.post(f"{BACKEND_URL}/api/auth/login", json={
        "email": test_email,
        "password": test_password
    })
    if login_res.status_code == 200:
        login_data = login_res.json()
        print(f"[✓] 登入成功，回傳 userId: {login_data.get('user_id')}")
        print(f"[✓] 回傳 token: {login_data.get('token')[:30]}...")
    else:
        print(f"[✗] 登入失敗: {login_res.status_code} - {login_res.text}")

    # 4. 測試登入 (錯誤密碼)
    print("\n--- 3. 測試錯誤密碼登入 ---")
    login_fail_res = requests.post(f"{BACKEND_URL}/api/auth/login", json={
        "email": test_email,
        "password": "WrongPassword"
    })
    if login_fail_res.status_code == 401:
        print(f"[✓] 登入成功拒絕，狀態碼: 401, 錯誤訊息: {login_fail_res.json().get('error')}")
    else:
        print(f"[✗] 錯誤：使用錯誤密碼竟然通過了或回傳錯誤狀態: {login_fail_res.status_code}")

if __name__ == "__main__":
    test_auth()
