import unittest

from services.disease_rule_service import load_disease_rules
from services.history_service import build_history_response
from services.profile_service import build_bmr_response
from services.recommend_service import build_preference_profile, compute_preference_score


class FakeStorage:
    def get_history(self, user_id: str, days: int):
        return [
            {"date": "2026-04-28", "record_count": 2, "calories": 1000, "protein": 50, "carbs": 120, "fat": 30, "sodium": 900},
            {"date": "2026-04-29", "record_count": 1, "calories": 800, "protein": 40, "carbs": 100, "fat": 20, "sodium": 700},
        ]


class ServiceSmokeTests(unittest.TestCase):
    def test_bmr_response(self):
        result = build_bmr_response({"gender": "male", "weight": 72, "height": 175, "age": 28, "activity_multiplier": 1.55})
        self.assertEqual(result["formula"], "Mifflin-St Jeor")
        self.assertGreater(result["bmr"], 0)
        self.assertGreater(result["tdee"], result["bmr"])

    def test_history_summary(self):
        result = build_history_response(FakeStorage(), "demo_user", 7)
        self.assertEqual(result["summary"]["recorded_days"], 2)
        self.assertEqual(result["summary"]["total_records"], 3)
        self.assertEqual(result["summary"]["avg_calories"], 900)

    def test_disease_rules_load(self):
        import os
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        rules = load_disease_rules(base_dir)
        self.assertIn("高血壓", rules)
        self.assertIn("max_sodium_per_meal", rules["高血壓"])

    def test_find_food_in_db(self):
        from services.predict_service import find_food_in_db
        
        custom_foods = [
            {
                "name_zh": "自訂手作餅乾",
                "brand": "烘焙坊",
                "nutrition_per_100g": {"calories": 450, "protein": 6.0, "fat": 20.0, "carbs": 60.0, "sodium": 150}
            }
        ]
        
        tfda_db = {
            "apple_key": {"name_zh": "富士蘋果", "calories": 50, "protein": 0.2, "fat": 0.1, "carbs": 12.0, "sodium": 1}
        }
        
        nutrition_db = {
            "滷肉飯": {"name_zh": "滷肉飯", "calories": 300, "protein": 8.0, "fat": 15.0, "carbs": 40.0, "sodium": 400}
        }
        
        # Test exact match on custom food
        res = find_food_in_db("自訂手作餅乾", [], custom_foods, tfda_db, nutrition_db)
        self.assertIsNotNone(res)
        self.assertEqual(res["calories"], 450)
        self.assertEqual(res["source"], "custom_food:烘焙坊")
        
        # Test exact match on nutrition_db
        res = find_food_in_db("滷肉飯", [], custom_foods, tfda_db, nutrition_db)
        self.assertIsNotNone(res)
        self.assertEqual(res["calories"], 300)
        self.assertEqual(res["source"], "nutrition_db")
        
        # Test partial match on tfda_db ("蘋果" matches "富士蘋果")
        res = find_food_in_db("蘋果", [], custom_foods, tfda_db, nutrition_db)
        self.assertIsNotNone(res)
        self.assertEqual(res["name_zh"], "富士蘋果")
        self.assertEqual(res["source"], "TFDA")
        
        # Test hint-based match ("魯肉飯" hints ["滷肉飯"] matches "滷肉飯" in nutrition_db)
        res = find_food_in_db("魯肉飯", ["滷肉飯", "豬肉"], custom_foods, tfda_db, nutrition_db)
        self.assertIsNotNone(res)
        self.assertEqual(res["name_zh"], "滷肉飯")
        self.assertEqual(res["source"], "nutrition_db")




    def test_preference_score(self):
        profile = build_preference_profile([
            {"foods": [{"name": "chicken", "calories": 220, "protein": 32, "sodium": 300, "source": "manual"}]}
        ])
        score, reasons = compute_preference_score(
            {"name_zh": "chicken salad", "label": "chicken", "calories": 240, "protein": 30, "sodium": 260, "source": "manual"},
            profile,
        )
        self.assertGreater(score, 0)
        self.assertGreater(len(reasons), 0)


if __name__ == "__main__":
    unittest.main()
