========================================================================
AUTONOMOUS VEHICLE PATH PLANNING & PERCEPTION - MANUAL DATA INGESTION
========================================================================

You can drop files directly into these subfolders at any time without using the UI uploader:

1. scenarios/
   - Drop custom driving scenario JSON files here (e.g., my_scenario.json).
   - Expected JSON schema format:
     {
       "id": "my_custom_scenario_01",
       "name": "My Custom Test Run",
       "category": "custom",
       "road": {
         "lanes": 2,
         "lane_width_m": 3.5,
         "length_m": 200,
         "curvature": 0.0,
         "lane_visibility": 1.0
       },
       "ego_start": {
         "x": 0,
         "y": 1.75,
         "speed_mps": 12.0,
         "max_speed_mps": 15.0
       },
       "obstacles": [
         {
           "id": "obs_1",
           "type": "vehicle",
           "x": 60,
           "y": 1.75,
           "vx": 0.0,
           "vy": 0.0,
           "width": 2.0,
           "length": 4.5
         }
       ]
     }
   - These will be auto-scanned and labeled with a "[Custom]" badge in the Scenario Selector.

2. media/
   - Drop road images (.jpg, .jpeg, .png) or short dashcam videos (.mp4) here.
   - These will appear in the Vision Lab dropdown so you can run OpenCV lane detection
     and YOLOv8 obstacle detection with a single click.

3. Auto-Refresh / Rescan:
   - Click the "Refresh add_data" button in the web UI (or hit POST /api/rescan-data)
     to make newly added files visible immediately without restarting the server.
========================================================================