import subprocess
import os

with open('cmd_output.txt', 'w') as f:
    try:
        result = subprocess.run(['pip', 'show', 'dnspython'], capture_output=True, text=True)
        f.write("--- pip show dnspython ---\n")
        f.write(result.stdout)
        f.write(result.stderr)
        
        result = subprocess.run(['python', 'test_mongo.py'], capture_output=True, text=True)
        f.write("\n--- python test_mongo.py ---\n")
        f.write(result.stdout)
        f.write(result.stderr)
    except Exception as e:
        f.write(f"\nError running commands: {e}")
