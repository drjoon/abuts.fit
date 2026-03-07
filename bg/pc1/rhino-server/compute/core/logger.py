from datetime import datetime


def log(message: str) -> None:
    """Simple stdout logger used across the rhino worker."""
    try:
        ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{ts}][rhino-pool] {message}", flush=True)
    except Exception:
        pass
