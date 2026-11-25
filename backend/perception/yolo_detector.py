import os
import cv2
import time
import torch
import numpy as np
from typing import Tuple, List, Dict, Any
from ultralytics import YOLO

class YOLODetector:
    """
    Ultralytics YOLOv8 real-time object detector for vehicles, pedestrians, and road obstacles.
    """
    TARGET_CLASSES = {
        0: "pedestrian",
        1: "bicycle",
        2: "car",
        3: "motorcycle",
        5: "bus",
        7: "truck",
        9: "traffic light",
        11: "stop sign"
    }

    CLASS_COLORS = {
        "pedestrian": (0, 165, 255),   # Orange
        "bicycle": (255, 191, 0),      # Deep sky blue
        "car": (0, 255, 0),            # Bright green
        "motorcycle": (255, 0, 255),   # Magenta
        "bus": (255, 255, 0),          # Cyan
        "truck": (0, 215, 255),        # Gold
        "traffic light": (0, 0, 255),  # Red
        "stop sign": (0, 0, 255)       # Red
    }

    def __init__(self, model_path: str = None, device: str = None):
        if model_path is None:
            model_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "models", "yolov8n.pt")
            if not os.path.exists(model_path):
                model_path = "yolov8n.pt"

        if device is None:
            device = "cuda" if torch.cuda.is_available() else "cpu"

        self.device = device
        self.model = YOLO(model_path)
        self.last_latency_ms = 0.0

    def set_device(self, new_device: str):
        """Dynamically switch execution device (CPU, CUDA, MPS)."""
        self.device = new_device
        # Warmup or move if necessary
        try:
            self.model.to(new_device)
        except Exception:
            pass

    def detect(self, image: np.ndarray, conf_threshold: float = 0.25) -> Tuple[np.ndarray, List[Dict[str, Any]], Dict[str, Any]]:
        t_start = time.perf_counter()
        h, w = image.shape[:2]
        annotated = image.copy()

        # Run inference
        results = self.model.predict(
            source=image,
            conf=conf_threshold,
            device=self.device,
            verbose=False
        )

        detected_objects = []

        if results and len(results) > 0:
            boxes = results[0].boxes
            for box in boxes:
                cls_id = int(box.cls[0].item())
                conf = float(box.conf[0].item())

                # Map class or fallback
                cls_name = self.TARGET_CLASSES.get(cls_id, results[0].names.get(cls_id, "object"))
                xyxy = box.xyxy[0].cpu().numpy()
                x1, y1, x2, y2 = map(int, xyxy)

                # Estimate distance from bottom y and box height (camera projection geometry)
                box_h = max(1, y2 - y1)
                # Pinhole model: distance approx = (real_height * focal_length) / pixel_height
                real_height_m = 1.6 if cls_name in ["pedestrian", "bicycle"] else 1.5
                focal_length_px = h * 1.15
                est_distance_m = round((real_height_m * focal_length_px) / box_h, 1)

                # Clamp distance to sensible range
                est_distance_m = min(120.0, max(2.0, est_distance_m))

                color = self.CLASS_COLORS.get(cls_name, (0, 255, 255))

                # Draw bounding box
                cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)

                # Label banner
                label = f"{cls_name} {conf:.2f} | {est_distance_m}m"
                (tw, th), baseline = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
                cv2.rectangle(annotated, (x1, max(0, y1 - th - 6)), (x1 + tw + 4, max(th + 6, y1)), color, -1)
                cv2.putText(annotated, label, (x1 + 2, max(th + 2, y1 - 3)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 0), 1, cv2.LINE_AA)

                detected_objects.append({
                    "class": cls_name,
                    "confidence": round(conf, 3),
                    "bbox": [x1, y1, x2, y2],
                    "estimated_distance_m": est_distance_m
                })

        t_end = time.perf_counter()
        self.last_latency_ms = round((t_end - t_start) * 1000.0, 2)

        telemetry = {
            "latency_ms": self.last_latency_ms,
            "device": self.device,
            "total_objects": len(detected_objects)
        }

        return annotated, detected_objects, telemetry
