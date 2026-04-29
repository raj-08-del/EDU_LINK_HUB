import requests
import json

base_url = "http://127.0.0.1:5000" # Assuming it's running here

def test_api(endpoint):
    print(f"Testing {endpoint}...")
    try:
        # We need a token because it's jwt_required
        # Wait, get_events in events.py is NOT jwt_required!
        # def get_events(): ... (no decorator)
        # Same for get_opportunities? No, get_opportunities is NOT decorated.
        
        r = requests.get(f"{base_url}{endpoint}")
        print(f"Status: {r.status_code}")
        print(f"Response: {r.text[:200]}...")
    except Exception as e:
        print(f"Error: {e}")

test_api("/api/events/")
test_api("/api/opportunities/")
