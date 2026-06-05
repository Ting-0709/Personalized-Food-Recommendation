from datetime import datetime, timezone
from services.healthy_food_service import RESTAURANT_CATALOG


def build_general_filtered_out(conditions: list, allergens: list, preferences: str) -> list:
    filtered_out = []
    # 1. 根據過敏原排除
    if allergens:
        filtered_out.append({
            "category": f"含有過敏原（{', '.join(allergens)}）的餐點",
            "reason": "自動過濾以避免引發過敏反應"
        })
    # 2. 根據疾病/健康狀況排除
    if conditions:
        for cond in conditions:
            if cond == "高血壓":
                filtered_out.append({
                    "category": "高鈉與重口味餐點",
                    "reason": "鈉含量通常較高，不利於血壓控制"
                })
            elif cond == "糖尿病":
                filtered_out.append({
                    "category": "高糖分與高 GI 精緻澱粉餐點",
                    "reason": "升糖指數過高，容易引起血糖急遽波動"
                })
            elif cond == "慢性腎臟病":
                filtered_out.append({
                    "category": "高蛋白與高鉀高磷餐點",
                    "reason": "蛋白質及離子含量較高，會加重腎臟代謝負擔"
                })
            elif cond == "痛風":
                filtered_out.append({
                    "category": "高普林餐點（如部分海鮮、熬煮肉湯）",
                    "reason": "普林含量較高，易誘發痛風發作"
                })
            elif cond == "高血脂":
                filtered_out.append({
                    "category": "高飽和脂肪與油炸類餐點",
                    "reason": "飽和脂肪含量過高，不利於血脂與血管健康"
                })
    # 3. 根據口味偏好排除
    if preferences:
        filtered_out.append({
            "category": "不符個人偏好之特定餐點",
            "reason": f"未符合您設定的飲食喜好偏好：{preferences}"
        })
    # 4. 預設籠統排除項目
    if not filtered_out:
        filtered_out.append({
            "category": "油炸與高油高鹽的精緻食品",
            "reason": "不符合健康餐飲的基本推薦標準"
        })
    return filtered_out


def normalize_number(value) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def build_candidate(label: str, nutrients: dict, source: str) -> dict | None:
    calories = nutrients.get("calories")
    if calories is None:
        return None

    return {
        "label": label,
        "name_zh": nutrients.get("name_zh", label),
        "calories": calories or 0,
        "protein": nutrients.get("protein", 0) or 0,
        "carbs": nutrients.get("carbs", 0) or 0,
        "fat": nutrients.get("fat", 0) or 0,
        "sodium": nutrients.get("sodium", 0) or 0,
        "fiber": nutrients.get("fiber", 0) or 0,
        "gi": nutrients.get("gi"),
        "allergens": nutrients.get("allergens", []) or [],
        "source": source,
    }


def build_custom_candidate(food_doc: dict) -> dict | None:
    base_nutrition = food_doc.get("nutrition_per_100g") or food_doc.get("nutrition_per_serving") or {}
    if not base_nutrition:
        return None
    return build_candidate(
        food_doc.get("food_id", food_doc.get("name_zh", "custom_food")),
        {
            "name_zh": food_doc.get("name_zh"),
            "calories": base_nutrition.get("calories"),
            "protein": base_nutrition.get("protein"),
            "carbs": base_nutrition.get("carbs"),
            "fat": base_nutrition.get("fat"),
            "sodium": base_nutrition.get("sodium"),
            "fiber": base_nutrition.get("fiber"),
            "allergens": food_doc.get("allergens", []),
        },
        food_doc.get("source", "custom-food"),
    )


def build_recommendation_candidates(storage, nutrition_db: dict, tfda_db: dict, user_id: str) -> list[dict]:
    candidates = []
    seen_labels = set()

    for label, nutrients in nutrition_db.items():
        candidate = build_candidate(label, nutrients, nutrients.get("source", "manual-db"))
        if candidate:
            candidates.append(candidate)
            seen_labels.add(candidate["label"])

    for label, nutrients in tfda_db.items():
        if label in seen_labels:
            continue
        candidate = build_candidate(label, nutrients, nutrients.get("source", "TFDA"))
        if candidate:
            candidates.append(candidate)
            seen_labels.add(candidate["label"])

    for food_doc in storage.get_custom_foods(user_id):
        candidate = build_custom_candidate(food_doc)
        if candidate:
            candidates.append(candidate)

    return candidates


def build_preference_profile(records: list[dict]) -> dict:
    foods = []
    source_counts = {}
    totals = {"calories": 0.0, "protein": 0.0, "carbs": 0.0, "fat": 0.0, "sodium": 0.0}

    for record in records:
        for food in record.get("foods") or []:
            name = (food.get("name") or food.get("foodName") or "").strip()
            if name:
                foods.append(name)
            source = food.get("source") or record.get("source")
            if source:
                source_counts[source] = source_counts.get(source, 0) + 1
            totals["calories"] += normalize_number(food.get("calories"))
            totals["protein"] += normalize_number(food.get("protein"))
            totals["carbs"] += normalize_number(food.get("carbs"))
            totals["fat"] += normalize_number(food.get("fat"))
            totals["sodium"] += normalize_number(food.get("sodium"))

    count = max(1, len(foods))
    avg = {key: value / count for key, value in totals.items()}
    favorite_sources = sorted(source_counts, key=source_counts.get, reverse=True)[:2]

    return {
        "food_names": foods[-30:],
        "avg": avg,
        "favorite_sources": favorite_sources,
        "record_count": len(records),
        "food_count": len(foods),
    }


def compute_preference_score(candidate: dict, profile: dict) -> tuple[int, list[str]]:
    if profile["food_count"] == 0:
        return 0, []

    score = 0
    reasons = []
    name = candidate.get("name_zh", "")
    label = candidate.get("label", "")
    name_pool = profile["food_names"]

    if any(name and (name in food_name or food_name in name) for food_name in name_pool):
        score += 18
        reasons.append("與近期常記錄食品相似")
    elif any(label and label in food_name for food_name in name_pool):
        score += 10
        reasons.append("與近期食品標籤相近")

    avg = profile["avg"]
    calories = normalize_number(candidate.get("calories"))
    if avg["calories"] > 0:
        calorie_gap = abs(avg["calories"] - calories)
        if calorie_gap <= 120:
            score += 12
            reasons.append("熱量接近你的近期餐點")
        elif calorie_gap <= 250:
            score += 6

    protein = normalize_number(candidate.get("protein"))
    if avg["protein"] > 0 and protein >= avg["protein"] * 0.8:
        score += 8
        reasons.append("蛋白質符合近期偏好")

    sodium = normalize_number(candidate.get("sodium"))
    if avg["sodium"] > 0 and sodium <= avg["sodium"]:
        score += 6
        reasons.append("鈉含量不高於近期平均")

    if candidate.get("source") in profile["favorite_sources"]:
        score += 4

    return min(score, 35), reasons[:3]


import os
import requests
import json
from services.nutrition_label_service import extract_json_block

def call_gemini_recommendation(prompt: str, api_key: str) -> list:
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
            print(f"[Gemini Recommend API] 嘗試使用第 {idx+1}/{len(keys)} 個 API Key...")
            resp = requests.post(url, json=payload, timeout=80)
            resp.raise_for_status()
            data = resp.json()
            text = data["candidates"][0]["content"]["parts"][0]["text"]
            return extract_json_block(text)
        except Exception as e:
            print(f"[Gemini Recommend API] 使用第 {idx+1} 個 Key 失敗: {e}")
            last_error = e
            continue

    print(f"[ERROR] 所有 API 金鑰均失效，日常推薦呼叫失敗: {last_error}")
    return []

def build_recommendation_response(storage, nutrition_db: dict, tfda_db: dict, disease_rules: dict, user_id: str, api_key: str = None):
    user = storage.get_user(user_id)
    if not user:
        return None

    if not api_key:
        api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")

    conditions = user.get("health_conditions", [])
    allergens = user.get("allergens", [])
    daily_target = user.get("daily_calorie_target", 2100)

    # 獲取今日已攝取
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    today_records = storage.get_records(user_id, today, limit=500)
    consumed_today = sum(record.get("total_calories", 0) for record in today_records)
    remaining_calories = max(0, daily_target - consumed_today)

    # 獲取近期紀錄以了解偏好
    recent_records = storage.get_records(user_id, limit=30)
    recent_foods = []
    for r in recent_records:
        for f in r.get("foods", []):
            fname = f.get("name") or f.get("foodName")
            if fname:
                recent_foods.append(fname)
    recent_foods = list(set(recent_foods))[:15]

    # 1. 取得近期紀錄的 Preference Profile
    profile = build_preference_profile(recent_records)

    # 2. 獲取所有本地及自訂的食物候選人
    candidates = build_recommendation_candidates(storage, nutrition_db, tfda_db, user_id)
    
    # 3. 對候選人進行過濾與偏好評分
    from services.predict_service import check_food_safety
    
    scored_candidates = []
    for c in candidates:
        # 硬性過濾：疾病禁忌與過敏原
        warnings = check_food_safety(c, 100, conditions, allergens, disease_rules)
        if warnings:
            continue
        
        # 口味偏好與營養符合度評分
        pref_score, pref_reasons = compute_preference_score(c, profile)
        
        scored_candidates.append({
            "candidate": c,
            "pref_score": pref_score,
            "pref_reasons": pref_reasons
        })
        
    # 按 pref_score 從高到低排序，選前 30 名
    scored_candidates.sort(key=lambda x: x["pref_score"], reverse=True)
    top_candidates = scored_candidates[:30]
    
    # 4. 彙整日常推薦候選品項
    menu_items = []
    
    # 加入本地高契合度食品
    for tc in top_candidates:
        c = tc["candidate"]
        menu_items.append({
            "restaurant_name": "日常推薦食材 (資料庫)",
            "item_name": c["name_zh"],
            "price": 0,
            "calories": c["calories"],
            "protein": c["protein"],
            "carbs": c["carbs"],
            "fat": c["fat"],
            "sodium": c["sodium"],
            "gi": c.get("gi") or "medium",
            "tags": [c["source"]],
            "is_general_food": True
        })

    # 加入美食地圖店家的餐點 (同時過濾安全)
    for restaurant in RESTAURANT_CATALOG:
        for item in restaurant["items"]:
            # 將 item 轉成類似 candidate 的 dict 來做 check_food_safety
            c_item = {
                "calories": item["calories"],
                "protein": item["protein"],
                "carbs": item["carbs"],
                "fat": item["fat"],
                "sodium": item["sodium"],
                "gi": item.get("gi") or "medium",
                "allergens": item.get("allergens") or [],
            }
            warnings = check_food_safety(c_item, 100, conditions, allergens, disease_rules)
            if warnings:
                continue
                
            menu_items.append({
                "restaurant_name": restaurant["name"],
                "item_name": item["name"],
                "price": item["price"],
                "calories": item["calories"],
                "protein": item["protein"],
                "carbs": item["carbs"],
                "fat": item["fat"],
                "sodium": item["sodium"],
                "gi": item.get("gi") or "medium",
                "tags": restaurant["tags"],
                "is_general_food": False
            })

    preferences = user.get("preferences", "")

    # 組裝 Prompt 讓 Gemini 來從附近健康店家的菜單中做個人化挑選推薦
    prompt = (
        f"請針對以下使用者的健康狀態、今日營養需求與口味偏好，從日常食材與附近店家的菜單候選列表中，推薦最適合的健康日常餐點（大約 5 到 7 項）。\n"
        f"【重要】我們提供兩種推薦來源，請混合推薦以維持多樣性：\n"
        f"1. 『日常推薦食材 (資料庫)』：這些是使用者平常喜歡吃、容易取得或與近期飲食習慣高度契合的食材與食品（例如水果、超商食品或家常菜）。請適度挑選 2-3 項推薦給他，幫助他維持平常的飲食習慣。對於這類品項，回傳的 name_zh 格式為 「[日常食材] 食物名稱」 (例如 「[日常食材] 富士蘋果」)。\n"
        f"2. 附近健康店家的菜單餐點：這些是外食選擇，請挑選 3-4 項。對於這類品項，回傳的 name_zh 格式為 「[餐廳名稱] 菜單餐點名稱」 (例如 「[原型健康餐盒] 舒肥雞胸餐盒」)。\n"
        f"請儘量多元化推薦，避免推薦多道極其相似或重複的餐點類型。\n\n"
        f"使用者基本檔案：\n"
        f"- 性別：{user.get('gender', '未知')}\n"
        f"- 今日熱量目標：{daily_target} kcal\n"
        f"- 今日剩餘可攝取熱量：{remaining_calories} kcal\n"
        f"- 疾病/健康狀況限制：{', '.join(conditions) if conditions else '無'}\n"
        f"- 過敏原限制：{', '.join(allergens) if allergens else '無'}\n"
        f"- 近期喜好的食物/口味：{', '.join(recent_foods) if recent_foods else '尚無飲食紀錄'}\n"
        f"- 個人口味與喜好設定：{preferences if preferences else '無'}\n\n"
        f"健康日常食材與店家菜單候選列表：\n"
        f"{json.dumps(menu_items, ensure_ascii=False, indent=2)}\n\n"
        f"請從列表中挑選出適合他的餐點，並回傳一個 JSON 陣列。每個元素必須包含以下屬性：\n"
        f"1. name_zh: 餐點或食材名稱，請務必遵照上述兩種來源規规定的命名格式 (例如 「[日常食材] 富士蘋果」 或 「[原型健康餐盒] 舒肥雞胸餐盒」)\n"
        f"2. calories: 熱量 (kcal)\n"
        f"3. protein: 蛋白質 (g)\n"
        f"4. carbs: 碳水化合物 (g)\n"
        f"5. fat: 脂肪 (g)\n"
        f"6. sodium: 鈉含量 (mg)\n"
        f"7. gi: 升糖指數類型 (low/medium/high)\n"
        f"8. safety_badges: 適合該使用者的安全標籤，例如 [\"低鈉\", \"高蛋白\", \"低 GI\"]，如無則回傳空陣列\n"
        f"9. preference_reasons: 推薦理由陣列，解釋為什麼推薦這道菜（請用第二人稱「你」），例如 [\"符合你今日剩餘卡路里配額\", \"高蛋白有助於肌肉維持\", \"符合你近期喜歡吃香蕉的習慣\"]\n"
        f"10. match_score: 契合度評分，介於 80 到 99 之間的整數\n\n"
        f"請只回傳合法 JSON 陣列，不要加入 markdown 包裹或多餘解釋。"
    )

    gemini_recs = []
    if api_key:
        gemini_recs = call_gemini_recommendation(prompt, api_key)

    is_fallback = False
    if not gemini_recs:
        is_fallback = True
        print("[WARN] Gemini 日常推薦 API 呼叫失敗，啟用附近店家菜單本地規則篩選機制...")
        fallback_recs = []
        for item in menu_items:
            # 簡單過敏原檢查
            if any(a in item.get("allergens", []) for a in allergens):
                continue
                
            score = 86
            badges = []
            reasons = []
            
            if item["calories"] < remaining_calories:
                score += 5
                reasons.append(f"符合你今日剩餘的 {int(remaining_calories)} kcal 額度")
            else:
                score -= 10
                reasons.append(f"熱量為 {item['calories']} kcal，建議分配在主餐食用")
                
            if item["protein"] >= 28:
                badges.append("高蛋白")
                reasons.append("提供豐富優質蛋白質，支持肌肉健康與代謝")
            if item["gi"] == "low":
                badges.append("低 GI")
                reasons.append("使用低升糖指數食材，有助於維持血糖穩定")
            if item["sodium"] < 400:
                badges.append("低鈉")
                reasons.append("低鈉量控制，契合你日常少負擔的飲食目標")
                
            if not badges:
                badges.append("健康首選")
            if not reasons:
                reasons.append("營養素分佈平均，非常契合你的一日目標")
                
            score = max(80, min(98, score))
            fallback_recs.append({
                "name_zh": f"[{item['restaurant_name']}] {item['item_name']}",
                "calories": item["calories"],
                "protein": item["protein"],
                "carbs": item["carbs"],
                "fat": item["fat"],
                "sodium": item["sodium"],
                "gi": item["gi"],
                "safety_badges": badges,
                "preference_reasons": reasons[:3],
                "match_score": score
            })
        fallback_recs.sort(key=lambda x: x["match_score"], reverse=True)
        gemini_recs = fallback_recs[:6]

    recommended = []
    for item in gemini_recs:
        if not isinstance(item, dict):
            continue
        name = item.get("name_zh", "健康餐點")
        source_label = "附近店家菜單智慧推薦" if is_fallback else "Gemini AI 店家推薦"
        recommended.append({
            "label": name,
            "name_zh": name,
            "calories": int(item.get("calories", 0)),
            "protein": float(item.get("protein", 0)),
            "carbs": float(item.get("carbs", 0)),
            "fat": float(item.get("fat", 0)),
            "sodium": int(item.get("sodium", 0)),
            "gi": item.get("gi", "medium"),
            "source": source_label,
            "match_score": int(item.get("match_score", 90)),
            "preference_score": 15,
            "preference_reasons": item.get("preference_reasons", ["智慧推薦"]),
            "safety_badges": item.get("safety_badges", ["安全餐點"]),
        })

    exclusions = build_general_filtered_out(conditions, allergens, preferences)

    return {
        "user_id": user_id,
        "remaining_calories": remaining_calories,
        "health_conditions": conditions,
        "recommended": recommended,
        "filtered_out": exclusions,
        "total_candidates": len(recommended),
        "total_filtered": len(exclusions),
        "source_counts": {
            "total": len(recommended),
            "tfda": 0,
            "custom_foods": 0,
            "manual_db": len(recommended),
        },
        "preference_profile": {
            "record_count": len(recent_records),
            "food_count": len(recent_foods),
        },
    }
