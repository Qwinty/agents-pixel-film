"""Decode the QR code from the final MP4 (the check the brief asks for).

    uv run --with opencv-python --with numpy python tools/qr_check.py out/film.mp4

Reads the last second of the film (the still ending) and every 0.25 s before it back to 42 s,
tries OpenCV's QR detector on the full 1920x1080 frame (as a phone would see the screen) and on a
2x-downscaled copy, and prints what it decodes. Exit code 0 only if the final frames decode.
"""
import sys
import cv2
import numpy as np

path = sys.argv[1] if len(sys.argv) > 1 else "out/film.mp4"
cap = cv2.VideoCapture(path)
fps = cap.get(cv2.CAP_PROP_FPS) or 30
n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
print(f"{path}: {n} frames @ {fps:.2f} fps, {int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))}x{int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))}")

det = cv2.QRCodeDetector()


def decode(img):
    txt, pts, _ = det.detectAndDecode(img)
    return txt or None


def frame_at(i):
    cap.set(cv2.CAP_PROP_POS_FRAMES, i)
    ok, fr = cap.read()
    return fr if ok else None


checks = sorted(set([n - 1, n - 5, n - 15, n - 29] + list(range(int(42 * fps), n, int(fps / 4)))))
final_ok = True
for i in checks:
    fr = frame_at(i)
    if fr is None:
        print(f"  frame {i}: unreadable")
        continue
    full = decode(fr)
    half = decode(cv2.resize(fr, (fr.shape[1] // 2, fr.shape[0] // 2), interpolation=cv2.INTER_AREA))
    gray = decode(cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY))
    res = full or half or gray
    print(f"  frame {i:4d} ({i / fps:6.2f} s): full={full!r} half={half!r} gray={gray!r}")
    if i >= n - 30 and not res:
        final_ok = False

if final_ok:
    print("QR OK: the final still decodes")
    sys.exit(0)
print("QR FAILED on the final still")
sys.exit(1)
