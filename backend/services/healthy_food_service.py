from datetime import datetime, timezone
from math import cos, radians, sin, sqrt, atan2


RESTAURANT_CATALOG = [
    {
        "restaurant_id": "fp_001",
        "name": "原型健康餐盒",
        "lat": 25.0338,
        "lng": 121.5645,
        "open_hours": ["11:00-20:30"],
        "tags": ["高蛋白", "低鈉", "健康餐盒"],
        "items": [
            {"name": "舒肥雞胸餐盒", "price": 140, "calories": 520, "protein": 38, "carbs": 42, "fat": 12, "sodium": 480, "gi": "low"},
            {"name": "鮭魚藜麥餐盒", "price": 180, "calories": 560, "protein": 34, "carbs": 40, "fat": 18, "sodium": 420, "gi": "low"},
        ],
    },
    {
        "restaurant_id": "fp_002",
        "name": "日光沙拉廚房",
        "lat": 25.0351,
        "lng": 121.5622,
        "open_hours": ["10:30-19:30"],
        "tags": ["沙拉", "低 GI"],
        "items": [
            {"name": "雞胸酪梨沙拉", "price": 155, "calories": 430, "protein": 30, "carbs": 18, "fat": 22, "sodium": 360, "gi": "low"},
            {"name": "豆腐藜麥碗", "price": 135, "calories": 410, "protein": 20, "carbs": 36, "fat": 14, "sodium": 300, "gi": "low"},
        ],
    },
    {
        "restaurant_id": "fp_003",
        "name": "輕湯食堂",
        "lat": 25.0316,
        "lng": 121.5661,
        "open_hours": ["11:00-14:00", "17:00-21:00"],
        "tags": ["湯品", "暖食"],
        "items": [
            {"name": "蒸魚野菜套餐", "price": 170, "calories": 470, "protein": 33, "carbs": 35, "fat": 14, "sodium": 520, "gi": "low"},
            {"name": "蕈菇雞湯麵", "price": 150, "calories": 590, "protein": 28, "carbs": 62, "fat": 16, "sodium": 680, "gi": "medium"},
        ],
    },
    {
        "restaurant_id": "fp_004",
        "name": "晨間好食",
        "lat": 25.0344,
        "lng": 121.5604,
        "open_hours": ["07:00-14:00"],
        "tags": ["早餐", "輕食"],
        "items": [
            {"name": "鮪魚蛋吐司盒", "price": 95, "calories": 390, "protein": 24, "carbs": 34, "fat": 14, "sodium": 430, "gi": "medium"},
            {"name": "燕麥優格水果杯", "price": 85, "calories": 320, "protein": 15, "carbs": 38, "fat": 9, "sodium": 120, "gi": "low"},
        ],
    },
]


def is_open_now(open_hours: list[str], now: datetime) -> bool:
    current = now.strftime("%H:%M")
    for slot in open_hours:
        start, end = slot.split("-")
        if start <= current <= end:
            return True
    return False


def haversine_km(lat1, lon1, lat2, lon2):
    radius = 6371.0
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return radius * c


import random
import os
import requests
import json
from services.nutrition_label_service import extract_json_block

def call_gemini_healthy_food_recommendation(prompt: str, api_key: str) -> list:
    keys = [k.strip() for k in api_key.split(",") if k.strip()]
    if not keys:
        print("[ERROR] 沒有可用的 Gemini API key")
        return []

    last_error = None
    for idx, key in enumerate(keys):
        gemini_model = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash")
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_model}:generateContent?key={key}"
        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt}
                    ]
                }
            ]
        }
        try:
            print(f"[Gemini Map API] 嘗試使用第 {idx+1}/{len(keys)} 個 API Key...")
            resp = requests.post(url, json=payload, timeout=80)
            resp.raise_for_status()
            data = resp.json()
            text = data["candidates"][0]["content"]["parts"][0]["text"]
            return extract_json_block(text)
        except Exception as e:
            print(f"[Gemini Map API] 使用第 {idx+1} 個 Key 失敗: {e}")
            last_error = e
            continue

    print(f"[ERROR] 所有 API 金鑰均失效，地圖推薦呼叫失敗: {last_error}")
    return []

def build_healthy_food_recommendations(storage, disease_rules: dict, user_id: str, params: dict, api_key: str = None):
    user = storage.get_user(user_id)
    if not user:
        return None

    if not api_key:
        api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")

    lat = float(params.get("lat", 25.0338))
    lng = float(params.get("lng", 121.5645))
    radius_km = float(params.get("radius", 1.0)) # 預設搜尋半徑為 1.0 km

    now = datetime.now(timezone.utc)
    conditions = user.get("health_conditions", [])
    daily_target = user.get("daily_calorie_target", 2100)
    allergens = user.get("allergens", [])
    preferences = user.get("preferences", "")

    today = now.strftime("%Y-%m-%d")
    today_records = storage.get_records(user_id, today, limit=500)
    consumed = {
        "calories": sum(r.get("total_calories", 0) for r in today_records),
        "protein": sum(r.get("total_protein", 0) for r in today_records),
        "carbs": sum(r.get("total_carbs", 0) for r in today_records),
        "fat": sum(r.get("total_fat", 0) for r in today_records),
        "sodium": sum(r.get("total_sodium", 0) for r in today_records),
    }
    remaining = {
        "calories": max(0, daily_target - consumed["calories"]),
        "protein": max(0, 130 - consumed["protein"]),
        "carbs": max(0, 250 - consumed["carbs"]),
        "fat": max(0, 70 - consumed["fat"]),
        "sodium": max(0, 2000 - consumed["sodium"]),
    }

    # 動態偏移餐廳經緯度到當前定位附近，保證不論定位在哪，附近都一定有店家可測試
    mapped_restaurants = {}
    menu_items = []
    
    for idx, restaurant in enumerate(RESTAURANT_CATALOG):
        # 根據餐廳ID生成確定性的偏移量
        idx_hash = sum(ord(c) for c in restaurant["restaurant_id"])
        random.seed(idx_hash)
        
        # 隨機偏移動態距離在 150m 至 800m 內
        offset_lat = (random.random() - 0.5) * 0.008
        offset_lng = (random.random() - 0.5) * 0.008
        
        r_lat = lat + offset_lat
        r_lng = lng + offset_lng
        distance_km = haversine_km(lat, lng, r_lat, r_lng)

        # 根據使用者設定的搜尋半徑過濾 (範圍)
        if distance_km > radius_km:
            print(f"  [Radius Filter] Skip {restaurant['name']} (distance={distance_km:.2f}km > radius={radius_km}km)")
            continue
        
        mapped_restaurants[restaurant["restaurant_id"]] = {
            "name": restaurant["name"],
            "lat": r_lat,
            "lng": r_lng,
            "distance_km": round(distance_km, 2),
            "tags": restaurant["tags"],
            "open_hours": restaurant["open_hours"]
        }
        
        # 蒐集該店家所有菜單品項，送給 Gemini 推薦
        for item_idx, item in enumerate(restaurant["items"]):
            item_id = f"{restaurant['restaurant_id']}_{item_idx}"
            menu_items.append({
                "item_id": item_id,
                "restaurant_id": restaurant["restaurant_id"],
                "restaurant_name": restaurant["name"],
                "item_name": item["name"],
                "price": item["price"],
                "calories": item["calories"],
                "protein": item["protein"],
                "carbs": item["carbs"],
                "fat": item["fat"],
                "sodium": item["sodium"],
                "gi": item.get("gi", "low")
            })

    if not menu_items:
        # 如果因為搜尋半徑過小而沒有任何店家符合
        return {
            "user_id": user_id,
            "radius_km": radius_km,
            "location": {"lat": lat, "lng": lng},
            "remaining": remaining,
            "recommended": [],
            "filtered_out": [],
        }

    # 呼叫 Gemini 進行挑選與過濾
    prompt = (
        f"你是一個專業的 AI 營養學家與健康飲食顧問。以下是使用者的健康需求與剩餘卡路里配額：\n"
        f"- 剩餘卡路里配額：{remaining['calories']} kcal\n"
        f"- 今日已攝取：卡路里 {consumed['calories']} kcal, 蛋白質 {consumed['protein']}g, 碳水 {consumed['carbs']}g, 脂肪 {consumed['fat']}g, 鈉 {consumed['sodium']}mg\n"
        f"- 疾病/健康限制條件：{', '.join(conditions) if conditions else '無'}\n"
        f"- 過敏原限制條件：{', '.join(allergens) if allergens else '無'}\n"
        f"- 個人口味與喜好設定：{preferences if preferences else '無'}\n\n"
        f"【重要】請儘量多元化推薦，避免推薦多道極其相似或重複的餐點類型。\n\n"
        f"以下為附近餐廳的菜單品項列表：\n"
        f"{json.dumps(menu_items, ensure_ascii=False, indent=2)}\n\n"
        f"請幫這位使用者從菜單中挑選出適合他的健康推薦餐點（挑選 6 到 10 項，剔除嚴重違反疾病限制或包含過敏原的項目）。\n"
        f"請回傳一個 JSON 陣列。每個元素代表推薦的餐點，必須包含以下屬性：\n"
        f"1. item_id: 對應菜單中的 item_id\n"
        f"2. match_score: 契合度評分 (80-99的整數)\n"
        f"3. safety_badges: 該使用者專屬的安全標章，例如 [\"低鈉\", \"高蛋白\", \"低 GI\"]，如無則回傳空陣列\n"
        f"4. reasons: 推薦理由的繁體中文說明陣列（請用第二人稱「你」），例如 [\"符合你剩餘的 500 kcal 熱量額度\", \"鈉含量低，適合你的高血壓情況\", \"提供優質蛋白質有助於肌肉維持\"]\n\n"
        f"請只回傳合法 JSON 陣列，不要加入 markdown 包裹或多餘解釋。"
    )

    gemini_recs = []
    if api_key:
        gemini_recs = call_gemini_healthy_food_recommendation(prompt, api_key)

    if not gemini_recs:
        print("[!] Gemini API rate limited or failed — using local fallback rule-based recommendations")
        fallback_recs = []
        for item in menu_items:
            # Check allergens
            item_allergens = item.get("allergens") or []
            if any(a in item_allergens for a in allergens):
                continue
                
            score = 88
            badges = []
            reasons = []
            
            if item["calories"] < remaining["calories"]:
                score += 5
                reasons.append(f"符合你今日剩餘的 {int(remaining['calories'])} kcal 卡路里額度")
            else:
                score -= 10
                reasons.append(f"熱量稍高 ({item['calories']} kcal)，建議控制份量")
                
            if item["protein"] >= 28:
                badges.append("高蛋白質")
                reasons.append("提供豐富優質蛋白質，支持肌肉健康與代謝")
            if item["gi"] == "low":
                badges.append("低 GI")
                reasons.append("使用低升糖指數食材，能提供穩定能量釋放")
            if item["sodium"] < 400:
                badges.append("低鈉")
                reasons.append("鈉含量低，符合你的健康血壓控制目標")
                
            if not badges:
                badges.append("健康首選")
            if not reasons:
                reasons.append("營養比例均衡，完美融入你一日的健康目標")
                
            score = max(80, min(98, score))
            fallback_recs.append({
                "item_id": item["item_id"],
                "match_score": score,
                "safety_badges": badges,
                "reasons": reasons[:3]
            })
            
        fallback_recs.sort(key=lambda x: x["match_score"], reverse=True)
        gemini_recs = fallback_recs[:10]

    recommendations = []
    filtered_out = []

    # 建立一個快速比對查找原始餐點數值的 dict
    menu_dict = {x["item_id"]: x for x in menu_items}

    for rec in gemini_recs:
        item_id = rec.get("item_id")
        if item_id in menu_dict:
            orig = menu_dict[item_id]
            r_id = orig["restaurant_id"]
            rest = mapped_restaurants[r_id]
            
            recommendations.append({
                "restaurant_id": r_id,
                "restaurant_name": rest["name"],
                "restaurant_lat": rest["lat"],
                "restaurant_lng": rest["lng"],
                "distance_km": rest["distance_km"],
                "tags": rest["tags"],
                "item_name": orig["item_name"],
                "price": orig["price"],
                "calories": orig["calories"],
                "protein": orig["protein"],
                "carbs": orig["carbs"],
                "fat": orig["fat"],
                "sodium": orig["sodium"],
                "gi": orig["gi"],
                "match_score": int(rec.get("match_score", 90)),
                "safety_badges": rec.get("safety_badges", ["安全"]),
                "reasons": rec.get("reasons", [f"距離約 {rest['distance_km']} km"]),
            })
            
    # 建立一個非重複且籠統的不推薦列表
    from services.recommend_service import build_general_filtered_out
    filtered_out = build_general_filtered_out(conditions, allergens, preferences)

    recommendations.sort(key=lambda x: x["match_score"], reverse=True)
    return {
        "user_id": user_id,
        "radius_km": radius_km,
        "location": {"lat": lat, "lng": lng},
        "remaining": remaining,
        "recommended": recommendations[:12],
        "filtered_out": filtered_out[:12],
    }
