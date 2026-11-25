import torch
import platform
import psutil

# Global active device preference
CURRENT_DEVICE = "auto"

def get_hardware_info():
    """
    Detects hardware acceleration capabilities (CUDA, Apple MPS, or CPU fallback)
    and lists all selectable hardware devices.
    """
    global CURRENT_DEVICE

    cuda_avail = torch.cuda.is_available()
    mps_avail = hasattr(torch.backends, "mps") and torch.backends.mps.is_available()

    # Determine effective active device
    if CURRENT_DEVICE == "auto":
        if cuda_avail:
            effective = "cuda"
        elif mps_avail:
            effective = "mps"
        else:
            effective = "cpu"
    else:
        effective = CURRENT_DEVICE

    # Format device name
    if effective == "cuda" and cuda_avail:
        dev_name = torch.cuda.get_device_name(0)
        accel_label = f"NVIDIA CUDA ({dev_name})"
    elif effective == "mps" and mps_avail:
        dev_name = "Apple Silicon GPU"
        accel_label = "Apple MPS (Metal)"
    else:
        dev_name = platform.processor() or "Multi-Core CPU"
        accel_label = "CPU (Optimized AVX/SSE)"

    # Build selectable list
    available_options = [
        {
            "id": "cpu",
            "name": "CPU (Multi-Threaded AVX/SSE)",
            "available": True,
            "description": "Universal fallback. Optimized using NumPy/PyTorch CPU vectorization."
        },
        {
            "id": "cuda",
            "name": "NVIDIA CUDA (GPU Acceleration)",
            "available": cuda_avail,
            "description": f"Dedicated NVIDIA GPU acceleration ({torch.cuda.get_device_name(0) if cuda_avail else 'No CUDA GPU detected'})"
        },
        {
            "id": "mps",
            "name": "Apple MPS (Metal)",
            "available": mps_avail,
            "description": "Apple Silicon unified memory acceleration."
        },
        {
            "id": "auto",
            "name": "Auto-Detect (Best Available)",
            "available": True,
            "description": "Automatically chooses CUDA > MPS > CPU based on hardware runtime."
        }
    ]

    info = {
        "device": effective,
        "selected_device": CURRENT_DEVICE,
        "device_name": dev_name,
        "acceleration": accel_label,
        "cuda_available": cuda_avail,
        "mps_available": mps_avail,
        "total_memory_gb": round(psutil.virtual_memory().total / (1024 ** 3), 2),
        "available_memory_gb": round(psutil.virtual_memory().available / (1024 ** 3), 2),
        "cpu_count": psutil.cpu_count(logical=True),
        "available_options": available_options,
        "status": "ready"
    }

    if cuda_avail:
        info["vram_total_gb"] = round(torch.cuda.get_device_properties(0).total_memory / (1024 ** 3), 2)

    return info

def set_hardware_device(target_device: str):
    global CURRENT_DEVICE
    target = target_device.lower().strip()
    if target not in ["cpu", "cuda", "mps", "auto"]:
        return {"success": False, "message": f"Invalid device '{target_device}'"}

    if target == "cuda" and not torch.cuda.is_available():
        CURRENT_DEVICE = "cpu"
        return {
            "success": False,
            "device": "cpu",
            "message": "NVIDIA CUDA is not available on this host. Gracefully retained CPU acceleration."
        }
    elif target == "mps" and not (hasattr(torch.backends, "mps") and torch.backends.mps.is_available()):
        CURRENT_DEVICE = "cpu"
        return {
            "success": False,
            "device": "cpu",
            "message": "Apple MPS is not available on this host. Gracefully retained CPU acceleration."
        }

    CURRENT_DEVICE = target
    info = get_hardware_info()
    return {
        "success": True,
        "device": info["device"],
        "selected_device": CURRENT_DEVICE,
        "acceleration": info["acceleration"],
        "message": f"Hardware accelerator switched to: {info['acceleration']}"
    }
