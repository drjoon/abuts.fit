# 조립 방법 PDF와 전체 내용 PDF.
# 재생: /tmp/indexer-cad-venv/bin/python make_reports.py

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (
    Image,
    KeepTogether,
    ListFlowable,
    ListItem,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parents[1]
CAD = ROOT / "cad"
PDF = ROOT / "pdf"
FONT = "/System/Library/Fonts/Supplemental/AppleGothic.ttf"
NAVY = colors.HexColor("#1f2937")
LINE = colors.HexColor("#d1d5db")
BAND = colors.HexColor("#f3f4f6")


def styles():
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    pdfmetrics.registerFont(TTFont("AppleGothic", FONT))
    base = dict(fontName="AppleGothic", alignment=TA_LEFT)
    ink = colors.HexColor("#4b5563")
    return {
        "title": ParagraphStyle("title", **base, fontSize=18, leading=24, textColor=NAVY, spaceAfter=4),
        "sub": ParagraphStyle("sub", **base, fontSize=10, leading=14, textColor=ink, spaceAfter=8),
        "h": ParagraphStyle("h", **base, fontSize=13, leading=18, textColor=NAVY, spaceBefore=12, spaceAfter=4),
        "p": ParagraphStyle("p", **base, fontSize=10, leading=15, textColor=NAVY, spaceAfter=4),
        "small": ParagraphStyle("small", **base, fontSize=8.5, leading=12, textColor=ink),
        "th": ParagraphStyle("th", **base, fontSize=9, leading=12, textColor=colors.white),
        "td": ParagraphStyle("td", **base, fontSize=9, leading=12, textColor=NAVY),
    }


S = styles()


def p(text):
    return Paragraph(text, S["p"])


def h(text):
    return Paragraph(text, S["h"])


def bullets(items):
    flow = []
    for item in items:
        flow.append(ListItem(Paragraph(item, S["p"]), leftIndent=8))
    return ListFlowable(flow, bulletType="1", start="1", leftIndent=16, bulletFontName="AppleGothic", bulletFontSize=10)


def dots(items):
    flow = []
    for item in items:
        flow.append(ListItem(Paragraph(item, S["p"]), leftIndent=8))
    return ListFlowable(flow, bulletType="bullet", leftIndent=16, bulletFontName="AppleGothic", bulletFontSize=10)


def table(rows, widths):
    data = []
    for r, row in enumerate(rows):
        style = S["th"] if r == 0 else S["td"]
        data.append([Paragraph(str(cell), style) for cell in row])
    tbl = Table(data, colWidths=widths, repeatRows=1)
    tbl.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), NAVY),
                ("BACKGROUND", (0, 1), (-1, -1), colors.white),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, BAND]),
                ("GRID", (0, 0), (-1, -1), 0.3, LINE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    return tbl


def picture(name, caption, max_w=170 * mm):
    path = CAD / name
    reader = ImageReader(str(path))
    w, ht = reader.getSize()
    draw_w = max_w
    draw_h = draw_w * ht / w
    if draw_h > 90 * mm:
        draw_h = 90 * mm
        draw_w = draw_h * w / ht
    return KeepTogether(
        [Image(str(path), width=draw_w, height=draw_h), Spacer(1, 2 * mm), Paragraph(caption, S["small"]), Spacer(1, 3 * mm)]
    )


def footer(title):
    def draw(canvas, doc):
        canvas.saveState()
        canvas.setFont("AppleGothic", 8)
        canvas.setFillColor(colors.HexColor("#6b7280"))
        canvas.drawString(18 * mm, 10 * mm, title)
        canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, str(doc.page))
        canvas.restoreState()

    return draw


def build(path, title, story):
    doc = SimpleDocTemplate(
        str(path),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=title,
        author="abuts.fit",
    )
    doc.build(story, onFirstPage=footer(title), onLaterPages=footer(title))


def assembly_story():
    story = [
        Paragraph("한 사람 각인 인덱서 조립", S["title"]),
        Paragraph("2026-11-22 · 단위 mm · cad/stp/assembly.stp", S["sub"]),
        p("폭 400mm. 오른쪽에 꽂고 왼쪽에서 담는다. 현미경은 벽 쪽에 둔다. 식별된 제품을 꺼내는 곳은 3번뿐이다."),
        h("1. 깎기 전에"),
        p("퍽의 대변 2.50mm, 포켓 2.60mm, 깊이 0.70mm는 가정이다. 실물 헥스가 더 낮으면 깊이를 줄인다. 포켓이 각인을 가리면 안 된다. 봉투 입구가 70mm가 아니면 지그를 다시 뽑는다."),
        h("2. 프레임"),
        p("2020 400mm 두 개를 앞뒤로 둔다. 앞 레일은 작업자 쪽, 뒤 레일은 벽 쪽이다. 100mm 두 개로 양 끝을 묶는다. 왼쪽 브리지는 아이들 축 아래, 오른쪽 브리지는 구동 스프로킷 바깥이다. 코너 브라켓으로 직각을 맞춘다."),
        h("3. 아이들 축"),
        bullets(
            [
                "왼쪽 축 높이 84mm. 레일 위 49mm 받침대 네 개, 그 위에 KP08 두 개. 볼트 간격 42mm.",
                "Ø8 축 120mm와 보어 8mm 스프로킷을 레일 사이에 둔다.",
                "중심거리 253.7mm는 나중에 모터를 밀어 맞춘다. 아이들 축은 고정이다.",
            ]
        ),
        h("4. 모터"),
        bullets(
            [
                "뒤 레일에 2020 포스트를 세우고 철 L브라켓으로 NEMA17을 단다. 축 높이를 84mm에 맞춘다.",
                "허브를 모터 축 Ø5에 고정하고, 보어 8mm 스프로킷을 허브에 꽂는다. 두 스프로킷이 일직선인지 본다.",
                "체인을 걸기 전에는 포스트를 느슨히 두고, 건 뒤에 팽팽해질 만큼만 민다.",
            ]
        ),
        h("5. 체인과 캐리어"),
        p("체인은 96링크, 609.6mm다. 1m를 잘라 이음이 위 직선에 오게 한다. 위는 오른쪽에서 왼쪽으로 간다. 한 칸은 모터 한 바퀴다."),
        bullets(
            [
                "캐리어 6개를 16피치, 101.6mm마다 둔다. 핀 코가 롤러 사이 3.05mm 틈에 들어가게 에폭시로 고정한다.",
                "퍽은 다월로 방향을 맞추고 M3로 잠근다. 노치가 벽 쪽(-Y)을 보게 한다. 각인도 그쪽으로 돌린다.",
                "원점 탭은 아래 한가운데 캐리어의 +X 끝에만 붙인다. 그림의 그 자세가 원점이다.",
                "아래 퍽은 바닥에서 12mm 이상 떠 있어야 한다.",
            ]
        ),
        h("6. 가드와 후드"),
        p("기둥 네 개는 앞 레일에 세운다. 2번에는 가드, 1번에는 후드 프레임과 후드를 올린다. 가드 창이 각인 높이를 가리지 않는지 2번 퍽 자리에서 본다."),
        bullets(
            [
                "경첩 핀 두 개로 후드를 프레임에 건다. 인쇄 구멍이 찌그러졌으면 후드를 닫은 채 Ø2.5로 다시 뚫는다.",
                "솔레노이드는 전원 없을 때 잠긴다. 후드를 닫으면 플런저가 러그에 들어간다.",
                "후드를 작업자 쪽으로 젖혔을 때 1번 퍽이 완전히 열리는지 확인한다.",
            ]
        ),
        h("7. 현미경, 지그, 센서"),
        bullets(
            [
                "UM20은 2번 벽 쪽. 렌즈면에서 각인 면까지 40mm, 광축 118mm에서 시작한다.",
                "봉투 지그와 불량컵은 3번 앞 레일에 단다. 컵이 지그보다 왼쪽이다. 실러는 지그 바로 앞 책상에 둔다.",
                "3번 센서는 벽 쪽에서 퍽을 본다. 원점 브라켓은 아래 탭을 본다. 준비 버튼은 앞 레일 가운데다.",
                "지그 스위치는 봉투가 눌릴 때만 켜지고, 후드 스위치는 닫힐 때만 켜진다.",
            ]
        ),
        h("8. 확인"),
        table(
            [
                ["확인", "기준"],
                ["폭", "400mm"],
                ["축 높이", "84mm. 두 스프로킷이 같은 높이"],
                ["중심거리", "253.7mm. 모터 포스트로 맞춤"],
                ["체인", "96링크, 609.6mm. 이음은 위"],
                ["바", "101.6mm 간격, 6개. 위 셋은 직선"],
                ["퍽", "노치가 모두 벽 쪽"],
                ["한 칸", "모터 1회전. 위 체인이 오른쪽으로부터 왼쪽"],
                ["슬롯", "1번·2번 위 통로 12mm. 3번만 열림"],
                ["창", "2번 각인이 가드에 가리지 않음"],
                ["지그", "봉투 하나. 컵과 20mm 이상 떨어짐"],
                ["후드", "전원 끄면 잠김. 3번이 비어야 열림"],
            ],
            [36 * mm, 138 * mm],
        ),
        Spacer(1, 3 * mm),
        p("담는 동안에는 1번에 손을 넣지 않는다. 3번 제품만 그 라벨의 봉투에 넣는다. 미인식은 불량컵이다."),
        picture("preview-top.png", "위. 긴 쪽이 체인. 작업자는 앞, 현미경은 반대쪽이다. 오른쪽이 1번, 왼쪽이 3번."),
        picture("preview-side.png", "옆. 두 덮개가 1번 후드와 2번 가드다. 축 높이 84mm."),
    ]
    return story


def full_story():
    return [
        Paragraph("한 사람 각인 인덱서", S["title"]),
        Paragraph("2026-11-22 · 단위 mm · 치수는 cad/dimensions.json", S["sub"]),
        p("커스텀어벗을 세로로 꽂아 벽 쪽에서 로트를 읽고, 왼쪽 칸에서 그 제품만 봉투에 담는다. 폭 400mm. 운용은 한 사람. 현미경과 문자 인식은 이 장비 밖이다."),
        p("솔리드는 cad/stp/assembly.stp 다. 라이노 가져오기, 단위 mm. 레진 STL은 베드 방향이고 STEP은 조립 방향이다."),
        h("1. 절대 규칙"),
        p("제품과 라벨은 같은 캐리어의 기록으로만 만난다. 대기열로 밀지 않는다. 손이 닿아 꺼낼 수 있는 식별된 제품은 3번 하나다. 1번은 잠긴 후드 안, 2번은 가드 안이다. 위 통로는 12mm라 손가락이 들어가지 않는다."),
        table(
            [
                ["상태", "라벨", "제품"],
                ["인식됨", "그 캐리어 한 장", "지그의 봉투 한 장에만"],
                ["미인식", "내지 않음", "불량컵. 봉투 금지"],
                ["인쇄 실패", "없음", "3번에 둔다. 같은 기록만 재인쇄"],
                ["라벨이 안 빠짐", "다음 장 금지", "이동 금지"],
            ],
            [32 * mm, 52 * mm, 90 * mm],
        ),
        Spacer(1, 2 * mm),
        p("지그에는 봉투가 하나만 들어간다. 프린터는 한 장을 내놓고, 떼야 다음 장이 나온다. 미인식인데 봉투가 지그에 있으면 이동하지 않는다."),
        h("2. 손"),
        p("작업자는 앞(+Y)에 선다. 오른쪽 1번과 왼쪽 3번 사이는 203mm다. 현미경은 벽 쪽이라 앞이 비어 있다. 오른손은 꽂고, 왼손은 3번에서 집어 지그에 넣은 뒤 앞으로 당겨 실링한다. 불량컵은 지그 왼쪽이다."),
        bullets(
            [
                "3번 라벨을 지그 봉투에 붙인다.",
                "3번 제품만 넣고 실링한 뒤 봉투를 치운다. 미인식이면 불량컵.",
                "3번과 지그가 비면 후드가 열린다. 그때 꽂고 닫는다.",
                "준비 버튼을 누르면 한 칸 간다.",
            ]
        ),
        p("담기를 끝내기 전에는 꽂지 않는다. 촬영은 담는 동안 2번에서 끝나고, 재촬영은 두 번까지다. 담기 14초, 꽂기 4초, 이동 1초를 가정하면 19초, 시간당 약 190개다. 꽂기가 8초로 남으면 23초다. 실측 전 가정이다."),
        picture("preview-top.png", "위쪽이 작업자. 반대쪽 큰 상자가 UM20. 오른쪽 1번, 왼쪽 3번."),
        picture("preview-side.png", "옆. 축 84mm, 퍽 윗면 117mm. 한 칸 101.6mm."),
        h("3. 치수"),
        p("바 간격 6.35 × 16 = 101.6mm. 체인 609.6mm, 96링크. 16톱니 피치원 32.549mm, 바깥 35.734mm, 중심거리 253.672mm. 모터 1회전이 한 칸이고, 위 체인은 오른쪽에서 왼쪽으로 간다."),
        table(
            [
                ["칸", "x", "하는 일"],
                ["1 꽂기", "303mm", "노치 쪽으로 각인을 돌려 꽂고 후드를 닫는다"],
                ["2 촬영", "201mm", "벽 쪽 UM20. 가드 창으로만 보인다"],
                ["3 담기", "100mm", "여기만 손이 들어간다"],
            ],
            [28 * mm, 28 * mm, 118 * mm],
        ),
        Spacer(1, 2 * mm),
        p("광축은 118mm, 렌즈면에서 각인 면까지 40mm. 각인 면은 벽 쪽이다. 헥스 대변 2.50mm, 포켓 2.60mm, 깊이 0.70mm는 가정이다. 실물을 재고 HEX_AF만 바꾼다. 봉투 입구 70mm가 아니면 BAG_MOUTH, 어벗이 12mm보다 굵으면 SLOT_W만 바꾼다."),
        h("4. 만들 것"),
        p("D20 자동선반과 레진으로 되는 것은 직접 만든다. 모터, 베어링, 체인, 스프로킷, 2020은 산다. 레진은 ABS-like다. 모델용 레진은 쓰지 않는다."),
        table(
            [
                ["구분", "부품", "수량"],
                ["선반", "헥스 퍽", "6"],
                ["선반", "체인 핀, 다월", "12, 6"],
                ["선반", "KP08 받침대 Ø16×49", "4"],
                ["선반", "가드 기둥 Ø16×90, 양 끝 M4", "4"],
                ["선반", "허브 Ø5→Ø8, 경첩 핀", "1, 2"],
                ["레진", "캐리어, 원점 탭", "6, 1"],
                ["레진", "가드, 후드 프레임, 후드", "각 1"],
                ["레진", "지그, 불량컵, 센서 홀더, 원점 브라켓", "각 1"],
            ],
            [28 * mm, 100 * mm, 46 * mm],
        ),
        Spacer(1, 2 * mm),
        p("KP08 두 개, Ø8 경질 축 하나, #25 16톱니 보어 8mm 두 개, 체인 96링크, NEMA17 0.4Nm급, 2020 400mm 두 개와 100mm 두 개. 반사 센서 둘, 레버 스위치 둘, 무전원 잠김 솔레노이드, 버튼. 구동부 구매는 대략 10만 원대다. 축 높이가 맞는 베어링 대신 값만 싼 것은 쓰지 않는다."),
        p("체인 장력은 뒤 레일에서 모터 포스트를 민다. 계산 중심거리는 253.7mm다."),
        h("5. 신호"),
        p("원점에서 1번 칸은 캐리어 1, 2번은 2, 3번은 3이다. 기록은 그 번호에 두고, 3번에 서 있는 번호만 인쇄한다."),
        table(
            [
                ["신호", "내용"],
                ["스텝", "한 칸 = 모터 1회전"],
                ["원점", "5번 탭"],
                ["3번, 지그, 후드, 라벨 필", "하나라도 남으면 이동 금지"],
                ["솔레노이드", "켤 때만 후드가 열림"],
                ["촬영", "캐리어 번호와 함께. 성공, 재촬영, 미인식, 인쇄 실패"],
            ],
            [52 * mm, 122 * mm],
        ),
        Spacer(1, 2 * mm),
        p("이동은 3번이 비고, 지그가 비고, 라벨이 빠지고, 후드가 잠기고, 촬영이 끝나고, 버튼이 눌리고, 인쇄 실패가 아닐 때다."),
        h("6. 파일과 실측"),
        p("부품 STEP은 cad/stp, 인쇄 STL은 cad/stl 이다. 조립 순서는 pdf/조립방법.pdf 다. 재생은 cad에서 build_model.py, export_step.py, make_reports.py 다."),
        dots(
            [
                "각인 헥스의 대변과 높이. 포켓이 각인을 덮는지.",
                "어벗이 12mm 슬롯을 지나는지. 봉투 입구 폭.",
                "UM20 작동거리 40mm.",
                "담기와 꽂기를 같은 제품으로 한 바퀴 잰다.",
            ]
        ),
    ]


def main():
    PDF.mkdir(parents=True, exist_ok=True)
    assembly = PDF / "조립방법.pdf"
    full = PDF / "전체내용.pdf"
    build(assembly, "한 사람 각인 인덱서 조립", assembly_story())
    build(full, "한 사람 각인 인덱서", full_story())
    for path in (assembly, full):
        data = path.read_bytes()
        if not data.startswith(b"%PDF") or len(data) < 20000:
            raise SystemExit(f"PDF too small: {path} {len(data)}")
        print(f"{path.name}\t{path.stat().st_size}")


if __name__ == "__main__":
    main()
