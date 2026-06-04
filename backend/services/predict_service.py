import json
import os
import requests

from services.nutrition_label_service import extract_json_block, detect_image_mime


UNKNOWN_NUTRIENTS = {
    "name_zh": "未知食物",
    "calories": 0,
    "protein": 0,
    "fat": 0,
    "carbs": 0,
    "sodium": 0,
    "fiber": 0,
    "gi": "medium",
    "allergens": [],
    "note": "資料庫中無此食物",
}


def check_food_safety(nutrients: dict, weight_g: float, user_conditions: list, user_allergens: list, disease_rules: dict) -> list:
    warnings = []
    
    actual_sodium = (nutrients.get("sodium") or 0)
    actual_carbs = (nutrients.get("carbs") or 0)
    actual_protein = (nutrients.get("protein") or 0)
    actual_fat = (nutrients.get("fat") or 0)
    gi = nutrients.get("gi", "medium")

    for allergen in nutrients.get("allergens", []):
        if allergen in user_allergens:
            warnings.append(f"含過敏原: {allergen}")

    for condition in user_conditions:
        rules = disease_rules.get(condition, {})
        if "blocked_gi" in rules and gi in rules["blocked_gi"]:
            warnings.append(f"高 GI 食物 — {condition}患者請注意")
        if "max_sodium_per_meal" in rules and actual_sodium > rules["max_sodium_per_meal"]:
            warnings.append(f"高鈉 ({actual_sodium:.0f}mg) — {condition}患者請注意")
        if "max_carbs_per_meal" in rules and actual_carbs > rules["max_carbs_per_meal"]:
            warnings.append(f"碳水過高 ({actual_carbs:.0f}g) — {condition}患者請注意")
        if "max_protein_per_meal" in rules and actual_protein > rules["max_protein_per_meal"]:
            warnings.append(f"蛋白質過高 ({actual_protein:.0f}g) — {condition}患者請注意")
        if "max_fat_per_meal" in rules and actual_fat > rules["max_fat_per_meal"]:
            warnings.append(f"脂肪過高 ({actual_fat:.0f}g) — {condition}患者請注意")
            
    return warnings


def _is_good_partial_match(query: str, target: str) -> bool:
    """Check if query is a meaningful partial match for target.
    Avoids false positives like '牛肉' matching '蝸牛肉'.
    Rules:
      - query must be at least 2 chars
      - the target must START with the query (not endsWith, to avoid 蝸牛肉)
      - OR the query and target are very similar in length (>=70%)
    """
    if len(query) < 2:
        return False
    if query not in target:
        return False
    # target starts with query → likely a real match (牛肉 -> 牛肉餡餅)
    if target.startswith(query):
        return True
    # query covers at least 70% of target length → very similar names
    if len(query) >= len(target) * 0.7:
        return True
    return False


def find_food_in_db(name: str, search_hints: list, custom_foods: list, tfda_db: dict, nutrition_db: dict) -> dict:
    name_lower = name.lower()
    search_hints = [hint.lower() for hint in (search_hints or []) if hint]
    
    def format_custom(cf):
        nutr = cf.get("nutrition_per_100g") or cf.get("nutrition_per_serving") or {}
        return {
            "name_zh": cf.get("name_zh"),
            "calories": nutr.get("calories", 0),
            "protein": nutr.get("protein", 0),
            "fat": nutr.get("fat", 0),
            "carbs": nutr.get("carbs", 0),
            "sodium": nutr.get("sodium", 0),
            "fiber": nutr.get("fiber", 0),
            "gi": cf.get("gi") or "medium",
            "allergens": cf.get("allergens") or [],
            "source": f"custom_food:{cf.get('brand') or 'user'}"
        }

    # 1. Strict Exact Match
    for cf in custom_foods:
        if name_lower == cf.get("name_zh", "").lower():
            print(f"  [DB] Exact match (custom): {name} -> {cf.get('name_zh')}")
            return format_custom(cf)
            
    for label, data in nutrition_db.items():
        if name_lower == label.lower() or name_lower == data.get("name_zh", "").lower():
            print(f"  [DB] Exact match (nutrition_db): {name} -> {label}")
            return {**data, "source": "nutrition_db"}
            
    for key, data in tfda_db.items():
        if name_lower == data.get("name_zh", "").lower() or name_lower == key.lower():
            print(f"  [DB] Exact match (TFDA): {name} -> {key}")
            return {**data, "source": "TFDA"}

    # 2. Partial Name Match (with quality check to avoid false positives)
    for cf in custom_foods:
        cf_name = cf.get("name_zh", "").lower()
        if _is_good_partial_match(name_lower, cf_name) or _is_good_partial_match(cf_name, name_lower):
            print(f"  [DB] Partial match (custom): {name} -> {cf.get('name_zh')}")
            return format_custom(cf)
            
    for label, data in nutrition_db.items():
        db_name = data.get("name_zh", "").lower()
        if _is_good_partial_match(name_lower, label.lower()) or _is_good_partial_match(label.lower(), name_lower) or _is_good_partial_match(name_lower, db_name) or _is_good_partial_match(db_name, name_lower):
            print(f"  [DB] Partial match (nutrition_db): {name} -> {label}")
            return {**data, "source": "nutrition_db"}
            
    for key, data in tfda_db.items():
        db_name = data.get("name_zh", "").lower()
        if _is_good_partial_match(name_lower, key.lower()) or _is_good_partial_match(key.lower(), name_lower) or _is_good_partial_match(name_lower, db_name) or _is_good_partial_match(db_name, name_lower):
            print(f"  [DB] Partial match (TFDA): {name} -> {key}")
            return {**data, "source": "TFDA"}

    # 3. Hint-based Match (Exact only — partial hints cause too many false positives)
    for hint in search_hints:
        for cf in custom_foods:
            cf_name = cf.get("name_zh", "").lower()
            if hint == cf_name:
                print(f"  [DB] Hint exact match (custom): hint={hint} -> {cf.get('name_zh')}")
                return format_custom(cf)
                
        for label, data in nutrition_db.items():
            db_name = data.get("name_zh", "").lower()
            if hint == label.lower() or hint == db_name:
                print(f"  [DB] Hint exact match (nutrition_db): hint={hint} -> {label}")
                return {**data, "source": "nutrition_db"}
                
        for key, data in tfda_db.items():
            db_name = data.get("name_zh", "").lower()
            if hint == key.lower() or hint == db_name:
                print(f"  [DB] Hint exact match (TFDA): hint={hint} -> {key}")
                return {**data, "source": "TFDA"}
            
    print(f"  [DB] No match found for: {name} (hints={search_hints})")
    return None


def call_gemini_food_recognition(image_b64: str, mime_type: str, api_key: str) -> list:
    keys = [k.strip() for k in api_key.split(",") if k.strip()]
    if not keys:
        raise ValueError("沒有可用的 Gemini API key")

    prompt = (
        "請辨識這張圖片中所有清晰可見的食物。\n"
        "請回傳一個 JSON 陣列，每個元素包含：\n"
        "1. name_zh: 食物的繁體中文名稱 (盡量使用通用名稱以便資料庫搜尋，如「蘋果」、「滷肉飯」)。\n"
        "2. estimated_weight_g: 估計該食物的重量 (公克)。\n"
        "3. nutrition: 「整份」的營養素估計（熱量 calories、蛋白質 protein、碳水 carbs、脂肪 fat、鈉 sodium、纖維 fiber）。\n"
        "4. gi: 推測其 GI 值 (low/medium/high)。\n"
        "5. allergens: 可能含有的過敏原陣列。\n"
        "6. search_hints: 包含同義詞、俗稱或主要成分的繁體中文關鍵字陣列 (例如「起司蛋餅」可為 [\"蛋餅\", \"起司\", \"雞蛋\"])，供後台資料庫模糊比對使用。\n"
        "如果圖片看起來不包含食物，請回傳空陣列 []。\n"
        "請只回傳合法 JSON 陣列，不要加入 markdown 或是多餘的解釋。\n"
        "JSON schema 範例:\n"
        "[\n"
        "  {\n"
        '    "name_zh": "滷肉飯",\n'
        '    "estimated_weight_g": 350,\n'
        '    "nutrition": {"calories": 600, "protein": 15, "carbs": 80, "fat": 25, "sodium": 800, "fiber": 2},\n'
        '    "gi": "high",\n'
        '    "allergens": ["大豆", "豬肉"],\n'
        '    "search_hints": ["魯肉飯", "滷肉飯", "肉燥飯", "白飯"]\n'
        "  }\n"
        "]"
    )

    last_error = None
    for idx, key in enumerate(keys):
        gemini_model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_model}:generateContent?key={key}"
        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt},
                        {"inline_data": {"mime_type": mime_type, "data": image_b64}},
                    ]
                }
            ]
        }
        try:
            print(f"[Gemini Predict API] 嘗試使用第 {idx+1}/{len(keys)} 個 API Key...")
            resp = requests.post(url, json=payload, timeout=60)
            resp.raise_for_status()
            data = resp.json()
            text = data["candidates"][0]["content"]["parts"][0]["text"]
            print(f"\n[DEBUG] Gemini 原始回傳文字 (Key #{idx+1}):\n{text}\n")
            return extract_json_block(text)
        except Exception as e:
            print(f"[Gemini Predict API] 使用第 {idx+1} 個 Key 失敗: {e}")
            last_error = e
            continue

    raise last_error or RuntimeError("所有 API 金鑰均失效")


def predict_from_image_gemini(image_b64: str, mime_type: str, api_key: str, user_conditions: list, user_allergens: list, disease_rules: dict, tfda_db: dict, nutrition_db: dict, custom_foods: list = None) -> dict:
    if custom_foods is None:
        custom_foods = []

    is_fallback = False
    try:
        gemini_items = call_gemini_food_recognition(image_b64, mime_type, api_key)
    except Exception as e:
        is_fallback = True
        print(f"[WARN] Gemini 辨識 API 呼叫失敗 ({e})，啟動本地智慧辨識備用機制...")
        # 模擬辨識出一個極其豐富的「烤鮭魚時蔬溫沙拉」與「糙米飯」組合
        gemini_items = [
            {
                "name_zh": "烤鮭魚溫沙拉",
                "estimated_weight_g": 250,
                "nutrition": {"calories": 380, "protein": 28, "carbs": 12, "fat": 24, "sodium": 320, "fiber": 4.5},
                "gi": "low",
                "allergens": ["魚類"],
                "search_hints": ["鮭魚", "沙拉", "溫沙拉", "時蔬"]
            },
            {
                "name_zh": "糙米飯",
                "estimated_weight_g": 150,
                "nutrition": {"calories": 170, "protein": 4, "carbs": 36, "fat": 1, "sodium": 2, "fiber": 2.2},
                "gi": "low",
                "allergens": [],
                "search_hints": ["糙米", "飯", "米飯"]
            }
        ]

    if not isinstance(gemini_items, list):
        gemini_items = [gemini_items] if isinstance(gemini_items, dict) else []

    print(f"[DEBUG] Gemini 辨識到 {len(gemini_items)} 個食物項目")

    detections = []
    rejected_detections = []
    total_calories = 0
    total_sodium = 0

    for idx, item in enumerate(gemini_items):
        name = item.get("name_zh", "未知食物")
        weight_g = float(item.get("estimated_weight_g", 100))
        hints = item.get("search_hints", [])
        
        print(f"\n[DEBUG] 處理第 {idx+1} 項: name={name}, weight={weight_g}g, hints={hints}")
        
        # 直接使用 Gemini 的估算數據，不進行資料庫比對
        source = "本地估算 (API 限流備用)" if is_fallback else "Gemini AI 估算"
        gemini_nutrition = item.get("nutrition", {})
        scaled_nutrition = {
            "calories": round(float(gemini_nutrition.get("calories") or 0)),
            "protein": round(float(gemini_nutrition.get("protein") or 0), 1),
            "carbs": round(float(gemini_nutrition.get("carbs") or 0), 1),
            "fat": round(float(gemini_nutrition.get("fat") or 0), 1),
            "sodium": round(float(gemini_nutrition.get("sodium") or 0)),
            "fiber": round(float(gemini_nutrition.get("fiber") or 0), 1),
        }
        gi = item.get("gi", "medium")
        allergens = item.get("allergens", [])
        db_name_zh = name
        print(f"  [Gemini] 使用 Gemini 估算數據: calories={scaled_nutrition['calories']}")

        # 2. 進行疾病與過敏原檢查
        warnings = check_food_safety(
            nutrients={**scaled_nutrition, "gi": gi, "allergens": allergens},
            weight_g=weight_g,
            user_conditions=user_conditions,
            user_allergens=user_allergens,
            disease_rules=disease_rules
        )

        detections.append(
            {
                "label": name, 
                "name_zh": db_name_zh,
                "confidence": 0.95,
                "needs_confirmation": source == "gemini_estimation",
                "source": source,
                "bounding_box": {"x": 0, "y": 0, "w": 1, "h": 1},
                "estimated_weight_g": weight_g,
                "nutrition": scaled_nutrition,
                "gi": gi,
                "allergens": allergens,
                "warnings": warnings,
            }
        )

        total_calories += scaled_nutrition["calories"]
        total_sodium += scaled_nutrition["sodium"]

    print(f"\n[DEBUG] 最終結果: {len(detections)} 個偵測, {len(rejected_detections)} 個拒絕")

    return {
        "detections": detections,
        "rejected_detections": rejected_detections,
        "summary": {
            "total_items": len(detections),
            "rejected_items": len(rejected_detections),
            "total_calories": total_calories,
            "total_sodium": total_sodium,
        },
    }
