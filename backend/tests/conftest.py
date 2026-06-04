import pytest
import os
import sys

# Ensure backend directory is in the path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app, storage

@pytest.fixture
def client():
    # Configure app for testing
    app.config['TESTING'] = True
    
    # Use the test client
    with app.test_client() as client:
        # Before each test, clear the in-memory storage to ensure tests don't affect each other
        # This is safe because we use in-memory lists/dicts when TESTING is True 
        # (Assuming we mock or reset the storage correctly)
        
        # We manually reset the internal lists of the storage repository
        storage.mem_users.clear()
        storage.mem_records.clear()
        storage.mem_custom_foods.clear()
        
        yield client

@pytest.fixture
def sample_user():
    return {
        "user_id": "test_user_001",
        "name": "Test User",
        "gender": "male",
        "weight": 70,
        "height": 175,
        "age": 25,
        "activity_level": "中等活動量",
        "activity_multiplier": 1.55,
        "daily_calorie_target": 2000,
        "health_conditions": ["高血壓"],
        "allergens": ["花生"],
        "target_weight": 68,
        "diet_type": "均衡飲食"
    }

@pytest.fixture
def sample_record():
    return {
        "user_id": "test_user_001",
        "meal_type": "午餐",
        "foods": [
            {
                "name": "測試用蘋果",
                "calories": 52,
                "protein": 0.3,
                "carbs": 14,
                "fat": 0.2,
                "sodium": 1,
                "fiber": 2.4
            }
        ],
        "total_calories": 52,
        "total_protein": 0.3,
        "total_carbs": 14,
        "total_fat": 0.2,
        "total_sodium": 1,
        "total_fiber": 2.4,
        "source": "manual"
    }
