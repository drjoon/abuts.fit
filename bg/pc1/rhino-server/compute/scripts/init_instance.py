# related files:
# - bg/pc1/rhino-server/rules.md
# - bg/pc1/rhino-server/compute/scripts/process_abutment_stl.py
# - bg/pc1/rhino-server/compute/scripts/align_stl_coordinate.py
# - web/backend/controllers/bg/bg.controller.js
import Rhino
import os

def main():
    print("Rhino instance initializing for abuts.fit pipe...")
    print(f"Rhino version: {Rhino.RhinoApp.Version}")
    # This script does nothing but keep the instance alive and visible to RhinoCode list
    
if __name__ == "__main__":
    main()
