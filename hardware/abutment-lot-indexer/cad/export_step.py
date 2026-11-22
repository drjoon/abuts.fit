# 한 사람 각인 인덱서 STEP. 단위 mm, AP214 솔리드.
# 라이노·인벤터. 부품 STEP은 설계 방향이고, 인쇄 방향은 STL이다.
# 재생: /tmp/indexer-cad-venv/bin/python export_step.py

from pathlib import Path

from build123d import Compound, export_step

from build_model import assembly_parts, lathe_parts, resin_parts, sprocket

OUT = Path(__file__).resolve().parent / "stp"


def save(part, name):
    path = OUT / name
    part.label = path.stem
    ok = export_step(part, path)
    if not ok or path.stat().st_size < 2000:
        raise SystemExit(f"STEP export failed: {path}")
    text = path.read_text(errors="ignore")
    if "ISO-10303-21" not in text or "MILLI" not in text or "METRE" not in text:
        raise SystemExit(f"STEP header is not millimetre AP: {path}")
    if "MANIFOLD_SOLID_BREP" not in text and "ADVANCED_BREP_SHAPE_REPRESENTATION" not in text:
        raise SystemExit(f"STEP is not a solid: {path}")
    return path


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    paths = []
    for name, part in {**resin_parts(), **lathe_parts()}.items():
        paths.append(save(part, f"{name}.stp"))
    paths.append(save(sprocket(), "sprocket.stp"))
    asm = Compound(children=assembly_parts())
    asm.label = "abutment-lot-indexer"
    paths.append(save(asm, "assembly.stp"))
    for path in paths:
        print(f"{path.name}\t{path.stat().st_size}")


if __name__ == "__main__":
    main()
