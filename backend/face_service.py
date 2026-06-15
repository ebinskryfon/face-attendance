import os
import json
import base64
import logging
from typing import Optional

import cv2
import numpy as np
from deepface import DeepFace
from PIL import Image
import io

logger = logging.getLogger(__name__)

CONFIDENCE_THRESHOLD = float(os.getenv("FACE_CONFIDENCE_THRESHOLD", "0.6"))
MODEL_NAME = "ArcFace"
# Detector fallback chain: fastest → most robust.
# yunet is a lightweight CNN — fast & accurate for real-world webcam conditions.
# ssd is a secondary fallback; retinaface is the last resort (slow but best).
_DEFAULT_DETECTOR = os.getenv("FACE_DETECTOR", "yunet")
_DETECTOR_CHAIN   = [_DEFAULT_DETECTOR, "ssd", "retinaface"]

# ── Model warm-up cache ────────────────────────────────────────────────────────
# DeepFace lazy-loads the neural network on the first call which adds 2-4 s.
# We trigger that load once at import time so every request is fast.
_model_loaded = False


def warmup_models() -> None:
    """Pre-load ArcFace + detectors so the first recognition request is instant."""
    global _model_loaded
    if _model_loaded:
        return
    logger.info("🔥 Warming up face recognition models…")
    dummy = np.zeros((160, 160, 3), dtype=np.uint8)
    for backend in _DETECTOR_CHAIN:
        try:
            DeepFace.represent(
                img_path=dummy,
                model_name=MODEL_NAME,
                detector_backend=backend,
                enforce_detection=False,
                align=False,
            )
        except Exception:
            pass  # expected — dummy has no face
    _model_loaded = True
    logger.info("✅ Face models ready.")


# ── Helpers ───────────────────────────────────────────────────────────────────

def decode_image(image_data: str | bytes) -> np.ndarray:
    """Decode base64 or raw bytes to an OpenCV (BGR) image array."""
    if isinstance(image_data, str):
        if "," in image_data:
            image_data = image_data.split(",", 1)[1]
        image_bytes = base64.b64decode(image_data)
    else:
        image_bytes = image_data

    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image data")
    return img


def _embed(img: np.ndarray) -> list[float]:
    """
    Run ArcFace on an already-decoded BGR numpy array.
    Tries each detector in _DETECTOR_CHAIN until one succeeds.
    """
    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    last_err: Exception = ValueError("No face detected")

    for backend in _DETECTOR_CHAIN:
        try:
            embeddings = DeepFace.represent(
                img_path=img_rgb,
                model_name=MODEL_NAME,
                detector_backend=backend,
                enforce_detection=True,
                align=True,
                anti_spoofing=True,
            )
            if not embeddings:
                last_err = ValueError("No face detected in the image")
                continue
            if len(embeddings) > 1:
                raise ValueError(
                    f"Multiple faces detected ({len(embeddings)}). Please use a single-person image."
                )
            
            face_data = embeddings[0]
            if not face_data.get("is_real", True):
                raise ValueError("Spoofing detected. Please present a real face.")

            logger.debug(f"Face detected using backend: {backend}")
            return face_data["embedding"]
        except ValueError:
            raise  # propagate validation errors (multiple faces, spoofing, etc.) immediately
        except Exception as e:
            last_err = e
            logger.debug(f"Detector '{backend}' failed: {e} — trying next…")
            continue

    raise ValueError(
        "No face could be detected. Please ensure your face is clearly visible, "
        "well-lit, and centred in the frame."
    )


# ── Public API ────────────────────────────────────────────────────────────────

def extract_face_encoding(image_data: str | bytes) -> list[float]:
    """
    Extract a 512-dim ArcFace embedding from image data.
    Raises ValueError if no face (or multiple faces) are detected.
    """
    img = decode_image(image_data)
    try:
        return _embed(img)
    except ValueError:
        raise
    except Exception as e:
        logger.error(f"Face encoding error: {e}")
        raise ValueError(f"Face detection failed: {str(e)}")


def cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    a = np.array(vec_a, dtype=np.float32)
    b = np.array(vec_b, dtype=np.float32)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


def recognize_face(
    image_data: str | bytes,
    known_encodings: list[dict],   # [{"employee_id": int, "encoding": str | list}]
) -> Optional[dict]:
    """
    Compare the input face against all known employee embeddings.
    Returns the best-match dict {employee_id, confidence} or None.
    """
    try:
        query_enc = extract_face_encoding(image_data)
    except ValueError:
        raise

    # Pre-parse stored JSON once per call (avoids repeated json.loads inside loop)
    parsed = [
        {
            "employee_id": r["employee_id"],
            "encoding": json.loads(r["encoding"]) if isinstance(r["encoding"], str) else r["encoding"],
        }
        for r in known_encodings
    ]

    if not parsed:
        return None

    # Vectorised cosine similarity against all employees at once
    query_vec  = np.array(query_enc,  dtype=np.float32)
    stored_mat = np.array([r["encoding"] for r in parsed], dtype=np.float32)  # (N, 512)

    norms   = np.linalg.norm(stored_mat, axis=1)            # (N,)
    q_norm  = np.linalg.norm(query_vec)
    scores  = stored_mat @ query_vec / (norms * q_norm + 1e-10)  # (N,)

    best_idx   = int(np.argmax(scores))
    best_score = float(scores[best_idx])

    if best_score < CONFIDENCE_THRESHOLD:
        return None

    return {
        "employee_id": parsed[best_idx]["employee_id"],
        "confidence":  round(best_score, 4),
    }


def save_face_image(image_data: str | bytes, upload_dir: str, filename: str) -> str:
    """Save face image to disk and return the full filepath."""
    os.makedirs(upload_dir, exist_ok=True)
    img = decode_image(image_data)
    filepath = os.path.join(upload_dir, filename)
    cv2.imwrite(filepath, img)
    return filepath
