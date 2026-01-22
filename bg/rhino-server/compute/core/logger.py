def log(message: str) -> None:
    """Simple stdout logger used across the rhino worker."""
    try:
        print(f"[rhino-pool] {message}", flush=True)
    except Exception:
        pass
