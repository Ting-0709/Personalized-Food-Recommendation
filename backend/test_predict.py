import base64
import json
import sys
import requests
import os

# 預設圖片路徑或由命令列傳入
IMAGE_PATH = sys.argv[1] if len(sys.argv) > 1 else "test_food.jpg"
# 替換成你的 Gemini API Key，或者設定環境變數
API_KEY = os.environ.get("GEMINI_API_KEY", "你的_GEMINI_API_KEY_放這裡") 
SERVER_URL = "http://127.0.0.1:5000/predict"

def main():
    if not os.path.exists(IMAGE_PATH):
        print(f"找不到圖片檔案：{IMAGE_PATH}")
        print("請準備一張食物的照片，命名為 test_food.jpg 放在同一資料夾，或者在指令後方加上圖片路徑。")
        print("範例: python test_predict.py my_lunch.jpg")
        return

    print(f"正在讀取圖片: {IMAGE_PATH} ...")
    with open(IMAGE_PATH, "rb") as f:
        img_bytes = f.read()
    
    img_b64 = base64.b64encode(img_bytes).decode("utf-8")

    payload = {
        "image": img_b64,
        "api_key": API_KEY,
        "health_conditions": ["高血壓"], # 模擬使用者有高血壓
        "allergens": ["甲殼類"]        # 模擬使用者對甲殼類過敏
    }

    print("正在發送請求至後端伺服器 (這可能需要幾秒鐘讓 Gemini 分析)...")
    try:
        response = requests.post(SERVER_URL, json=payload)
        response.raise_for_status()
        
        data = response.json()
        print("\n=== 🎉 辨識結果 ===")
        print(json.dumps(data, indent=2, ensure_ascii=False))
        
    except requests.exceptions.ConnectionError:
        print("\n❌ 無法連線到伺服器！請確保你的 Flask 伺服器 (app.py) 正在運行中。")
    except requests.exceptions.HTTPError as e:
        print(f"\n❌ 請求失敗: HTTP {response.status_code}")
        print(response.text)
    except Exception as e:
        print(f"\n❌ 發生錯誤: {e}")

if __name__ == "__main__":
    main()
