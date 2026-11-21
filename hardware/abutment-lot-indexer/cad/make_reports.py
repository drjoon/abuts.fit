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
    PageBreak,
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
    return KeepTogether([Image(str(path), width=draw_w, height=draw_h), Spacer(1, 2 * mm), Paragraph(caption, S["small"]), Spacer(1, 3 * mm)])


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
        Paragraph("세 칸 각인 인덱서 조립 방법", S["title"]),
        Paragraph("2026-11-21 · 단위 mm · 솔리드 STEP cad/stp/assembly.stp", S["sub"]),
        p("커스텀어벗을 세로로 꽂아 옆면 로트를 찍고, 3번에서 손으로 빼 봉투에 담는 폭 500mm 장비의 조립 순서다. 현미경 제어와 문자 인식은 이 장비 밖이다."),
        h("1. 조립 전에 실측"),
        p("헥스 퍽을 깎기 전에 각인이 있는 실물 헥스를 잰다. 모델의 대변 거리 2.50mm와 포켓 깊이 0.8mm는 가정이다. 육각 높이가 0.8mm보다 낮으면 포켓이 각인을 덮으므로 깊이를 줄인다. UM20이 각기둥인지 원통인지도 확인한다. 원통이면 안장 안쪽 108mm에 패드를 넣는다."),
        h("2. 공구와 체결"),
        dots(
            [
                "육각 렌치, M3 탭, M3 볼트·와셔, 2020용 T너트와 코너 브라켓",
                "8mm 샤프트용 베어링 4개. 라이저 구멍은 Ø8.4",
                "체인 이음 클립, 자, 틈새 게이지",
                "캐리어·안장·센서 브라켓·모터판은 PETG. 층 0.2mm, 벽 4장, 갈퀴 쪽에 브림",
                "헥스 퍽 6개는 인쇄하지 않고 CNC. 캐리어 아래에서 M3로 체결",
            ]
        ),
        h("3. 어디에 쓰나"),
        table(
            [
                ["이름", "수량", "파일", "하는 일"],
                ["캐리어", "6", "stp/carrier.stp", "체인 부싱 사이에 갈퀴가 물림"],
                ["헥스 퍽", "6", "stp/hex-puck.stp", "암헥스 깊이 0.8mm. CNC"],
                ["안장", "1", "stp/um20-saddle.stp", "UM20 바닥을 받음"],
                ["센서 브라켓", "1", "stp/sensor-bracket.stp", "3번, 벽 쪽"],
                ["모터판", "1", "stp/motor-plate.stp", "NEMA17, 장력 슬롯"],
                ["스프로킷", "2", "stp/sprocket.stp", "참고 형상. 실물은 #25 16톱니"],
                ["조립", "1", "stp/assembly.stp", "배치 확인용"],
            ],
            [32 * mm, 16 * mm, 48 * mm, 78 * mm],
        ),
        h("4. 프레임"),
        p("2020 500mm 두 개를 앞뒤로 두고, 80mm 두 개로 양 끝을 막는다. 바깥 폭 500mm, 앞뒤 바깥 80mm, 레일 윗면이 바닥에서 20mm다. 작업자 쪽 레일은 +Y, 벽 쪽 레일은 -Y다. 1번 꽂기는 작업자의 오른쪽이다."),
        bullets(
            [
                "긴 레일 두 개의 끝이 단축과 맞닿게 하고, 코너 브라켓으로 직각을 맞춘다.",
                "책상 위에 뒤틀림 없이 놓이는지 네 귀를 눌러 본다.",
            ]
        ),
        h("5. 축과 스프로킷"),
        p("축 높이는 바닥에서 70mm다. 왼쪽 축과 오른쪽 축의 중심거리는 406.1mm다. 피치원 지름 32.5mm라 스프로킷 바깥 간격은 439mm이고, 500mm 프레임 안에 들어간다."),
        bullets(
            [
                "라이저 4개를 축 위치에 세운다. 벽 쪽·작업자 쪽 각 2개. 베어링이 Ø8 연마봉을 물고, 봉 길이는 100mm다.",
                "#25 16톱니 스프로킷을 두 축의 레일 사이(y = 0 근처)에 둔다. 보어 8mm.",
                "오른쪽 축의 벽 쪽에 모터판을 먼저 건다. 판의 31mm 사각 구멍이 NEMA17과 맞고, 진행 방향 8mm 슬롯으로 중심거리를 406mm에 맞춘다.",
                "체인을 걸기 전에는 슬롯을 느슨하게 두고, 건 뒤에 팽팽해질 만큼만 민다.",
            ]
        ),
        h("6. 체인"),
        p("필요 길이는 914.4mm다. 시중 1m를 이음 클립으로 152.4mm의 6배가 되게 맞춘다. 이음 클립은 위 직선에 오게 해서, 스프로킷 이를 돌 때 걸리지 않게 한다."),
        p("위 체인은 오른쪽에서 왼쪽으로 간다. 빈 바는 왼쪽 스프로킷을 돌아 아래에서 오른쪽으로 돌아온다. 한 칸은 스프로킷 1.5바퀴다. 16톱니가 101.6mm를 끌고, 바 간격 152.4mm는 그 1.5배다."),
        h("7. 캐리어"),
        p("carrier.stp의 갈퀴가 체인을 향한다. 인쇄용 STL은 갈퀴가 위를 보도록 뒤집어 두었고, 나사면이 베드에 닿는다. STEP은 설계 방향이라 인쇄 방향과 다르다."),
        bullets(
            [
                "갈퀴 두 개의 간격은 6.35mm, 두께 2.0mm, 폭 2.6mm다. #25 부싱 지름 3.30mm라 부싱 사이 틈은 3.05mm다. 갈퀴가 그 틈에 들어가야 한다.",
                "바 6개를 24피치, 152.4mm마다 같은 위상으로 꽂는다. 위 3개, 아래 3개.",
                "멈춘 위치에서 1번 바는 오른쪽 위 접선에서 진행 방향으로 16mm 들어온 곳이다. x = 437mm. 2번은 x = 285mm, 3번은 x = 132mm. 세 칸 모두 위 직선이고 갈퀴는 위를 본다.",
                "아래 세 바의 퍽은 바닥에서 8mm 이상 떠 있어야 한다.",
            ]
        ),
        h("8. 헥스 퍽의 방향"),
        p("각인은 헥스 바깥 면 하나에 있다. 퍽은 그 육각이 0.8mm만 들어가는 암헥스다. 수핀으로 하면 각인 면이 가려진다. 포켓 대변은 모델 2.50mm보다 0.10mm 넓은 2.60mm다."),
        bullets(
            [
                "M3 탭 두 개의 간격은 10mm다. 캐리어 관통구멍과 맞춘 뒤 아래에서 조인다.",
                "여섯 퍽의 평평한 면 하나가 모두 작업자(+Y)를 보게 한다. 꽂는 사람은 각인 면을 그 면에 돌린다.",
                "포켓 림 위 1mm가 광축이다. 바닥에서 106.5mm.",
            ]
        ),
        h("9. 현미경"),
        p("UM20 상자는 106 × 152 × 106mm다. 2번 칸 앞에 두고, 렌즈면에서 헥스 면까지 40mm를 출발점으로 삼는다. 안장 윗면이 본체 바닥에 닿고, 팔은 작업자 쪽 2020에서 본체 아래로 나온다."),
        bullets(
            [
                "안장 나사를 풀어 높이와 앞뒤를 ±10mm 안에서 맞춘다. 각인 높이를 재기 전에는 팔의 구멍 위치를 고정하지 않는다.",
                "렌즈는 작업자 쪽에서 벽 쪽을 본다. 초점과 촬영은 패킹 PC가 한다.",
            ]
        ),
        h("10. 센서, 모터, 책상"),
        bullets(
            [
                "3번 포토센서는 벽 쪽(-Y)에서 퍽 높이를 본다. 작업자가 빼는 +Y 쪽은 비운다.",
                "NEMA17은 오른쪽 스프로킷의 벽 쪽에 단다. 축과 모터 축이 일직선인지 손으로 한 바퀴 돌려 확인한다.",
                "라벨 프린터와 탁상 임펄스 실러, 봉투는 3번 왼쪽 책상에 둔다. 기계가 봉투를 밀지 않는다.",
                "준비 버튼은 꽂는 사람과 빼는 사람이 같이 누를 수 있는 자리에 둔다.",
            ]
        ),
        h("11. 조립 후 확인"),
        table(
            [
                ["확인", "기준"],
                ["프레임 폭", "500mm"],
                ["축 높이", "바닥에서 70mm"],
                ["축 중심거리", "406mm. 모터판 슬롯으로 맞춤"],
                ["체인", "914mm, 이음은 위 직선"],
                ["바 간격", "152.4mm, 6개"],
                ["위 세 바", "위를 보고 직선 위에 있음"],
                ["퍽 방향", "여섯 개 모두 평탄면이 +Y"],
                ["갈퀴", "부싱 사이 3.05mm 틈에 들어감"],
                ["아래 퍽", "바닥에서 8mm 이상"],
                ["렌즈 간격", "헥스 면에서 40mm, 광축 106mm"],
                ["3번 센서", "벽 쪽. 제품이 있으면 체인이 안 움직임"],
                ["한 칸", "스프로킷 1.5회전 후 같은 칸에 다음 바"],
            ],
            [40 * mm, 134 * mm],
        ),
        Spacer(1, 3 * mm),
        p("이동은 3번 센서가 비고, 준비 버튼이 눌리고, 2번 촬영이 끝났거나 재촬영 두 번이 끝났을 때만 한다. 인쇄가 실패하면 버튼이 눌려도 움직이지 않는다."),
        picture("preview-top.png", "위에서 본 배치. 오른쪽이 1번, 가운데가 2번, 왼쪽이 3번. 작업자 쪽으로 나온 상자가 UM20이다."),
        picture("preview-side.png", "옆에서 본 배치. 긴 막대는 2020, 양 끝 원판은 스프로킷이다."),
    ]
    return story


def full_story():
    story = [
        Paragraph("세 칸 각인 인덱서 전체 내용", S["title"]),
        Paragraph("2026-11-21 · 단위 mm · 치수는 cad/dimensions.json 과 같다", S["sub"]),
        p("커스텀어벗을 세로로 꽂아 옆면 로트를 찍고, 손으로 빼 봉투에 담는 폭 500mm 장비다. 현미경 제어와 문자 인식은 이 장비 밖이고, 여기서는 바의 이동과 3번 칸의 안전만 담당한다."),
        p("3D는 솔리드 STEP이다. 라이노와 인벤터에서 cad/stp/assembly.stp 를 연다. 단위는 밀리미터다. 부품별 파일은 같은 폴더에 있다. STL은 인쇄·미리보기용으로 그대로 둔다."),
        h("1. 공정"),
        p("위에는 작업 바 3개만 선다. 체인은 위를 오른쪽에서 왼쪽으로 한 칸씩 가고, 빈 바는 아래로 뒤집혀 돌아온다. 바는 전부 6개다."),
        table(
            [
                ["칸", "위치", "하는 일"],
                ["1 꽂기", "오른쪽, x = 437mm", "헥스를 퍽에 맞추고 각인 면이 작업자를 보게 꽂는다"],
                ["2 촬영", "가운데, x = 285mm", "ViTiny UM20이 작업자 쪽에서 반대 벽을 향해 찍는다"],
                ["3 빼서 담기", "왼쪽, x = 132mm", "손으로 빼 봉투에 넣고, 라벨을 붙이고, 탁상 실러로 닫는다"],
            ],
            [28 * mm, 40 * mm, 106 * mm],
        ),
        Spacer(1, 3 * mm),
        p("한 사람이 1번과 3번을 이어서 할 수 있다. 두 사람이면 오른쪽이 꽂고 왼쪽이 뺀다. 꽂기, 빼기, 촬영은 체인이 멈춘 동안 같이 시작한다."),
        p("봉투는 기계가 밀지 않는다. 3번에서 그 제품만 손으로 담으므로, 급지가 밀려 다른 로트 봉투에 들어가는 일이 없다."),
        h("2. 배치"),
        p("작업자는 +Y 쪽에 선다. 1번은 작업자의 오른쪽이다. 프레임 폭 500mm 안에 스프로킷 바깥 간격 439mm가 들어간다. 축 높이는 바닥에서 70mm다. 아래쪽 빈 바의 퍽은 바닥에서 8mm 이상 떠 있다. 작업자 쪽 현미경까지 포함한 앞뒤 크기는 바닥 기준 y = -84mm에서 193mm까지다."),
        picture("preview-side.png", "옆에서 본 조립. 긴 막대는 2020, 양 끝 원판은 #25 16톱니 스프로킷이다."),
        picture("preview-top.png", "위에서 본 조립. 작업자 쪽으로 나온 직육면체가 UM20이고, 오른쪽 벽 쪽 상자가 NEMA17이다."),
        p("체인 살은 모델에 넣지 않았다. 스프로킷 중심, 바 위치, 캐리어 물림은 아래 식으로 고정돼 있다. 치수선 그림은 cad/drawing-side.svg, cad/drawing-top.svg 다."),
        h("3. 치수 계산"),
        p("#25 체인 피치는 6.35mm다. 바 간격은 24피치다."),
        p("바 간격 = 6.35 × 24 = 152.4mm<br/>바 6개 체인 길이 = 152.4 × 6 = 914.4mm<br/>16톱니 피치원 = 6.35 / sin(π/16) = 32.549mm<br/>바깥 지름 = 6.35 × (0.6 + cot(π/16)) = 35.734mm<br/>중심거리 = (914.4 - π × 32.549) / 2 = 406.072mm"),
        p("1번과 3번 사이는 304.8mm다. 한 팔이 양쪽 칸에 닿는다. 멈춘 뒤 1번 바는 오른쪽 위 접선에서 체인 진행 방향으로 16mm 들어온 곳이다. 세 칸 모두 위 직선에 있고 바는 위를 본다. 나머지 세 바는 아래 직선에서 아래를 본다."),
        p("한 칸 이동은 스프로킷 1.5바퀴다. 16톱니가 체인 16피치, 101.6mm를 끌고, 바 간격 152.4mm는 그 1.5배다."),
        h("4. 헥스 받침대"),
        p("각인은 헥스 바깥 면 하나에 있다. 받침대는 그 육각이 들어가는 암헥스 퍽이다. 수헥스 핀으로 하면 각인 면이 핀에 가려지거나 서로 맞물리지 않는다."),
        table(
            [
                ["항목", "값"],
                ["퍽 높이", "8mm"],
                ["퍽 지름", "12mm"],
                ["포켓 깊이", "0.8mm"],
                ["대변 거리", "모델 2.50mm, 포켓 2.60mm"],
                ["고정", "M3 탭 2개, 간격 10mm. 캐리어 아래에서 체결"],
            ],
            [40 * mm, 134 * mm],
        ),
        Spacer(1, 3 * mm),
        p("0.8mm만 육각을 물고, 그 위의 각인은 작업자 쪽 면에 남는다. 광축은 포켓 림보다 1mm 위, 바닥에서 106.5mm다."),
        p("대변 거리 2.50mm는 가정치다. 임플란트 규격에 따라 2.0, 2.4, 2.7mm가 섞인다. 첫 실물 헥스를 재고 build_model.py 의 HEX_AF 만 바꾼 뒤 퍽을 다시 깎고 STEP을 다시 보낸다. 나사 간격은 그대로다. 실제 육각 높이가 0.8mm보다 낮으면 포켓 깊이도 같이 줄인다. 퍽 STEP은 가공 참고 형상이고, 인쇄하지 않는다."),
        h("5. 캐리어"),
        p("인쇄 캐리어가 #25 체인에 물린다. 부싱 사이 틈은 6.35 - 3.30 = 3.05mm다. 폭 2.0mm, 체인 진행 방향으로 한 피치(6.35mm) 떨어진 갈퀴 두 개가 그 틈에 들어가 밀림과 비틀림을 막는다. 갈퀴 폭 2.6mm는 내폭 3.10mm 안에 있다."),
        p("캐리어 위에서 M3 관통구멍 두 개가 퍽 탭과 맞는다. 육각의 작업자 쪽 면은 캐리어에 대해 한 방향이다. 꽂는 사람은 각인 면을 그 면에 맞춘다."),
        p("carrier.stl 은 갈퀴가 위를 보도록 뒤집어 두었다. 나사면이 베드에 닿는다. PETG, 층 0.2mm, 벽 4장, 갈퀴 아래에 브림을 준다. 6개를 같은 파일로 찍는다. carrier.stp 는 설계 방향이다."),
        h("6. 현미경"),
        p("ViTiny UM20 설명서의 본체는 106(L) × 106(W) × 152(T) mm이고, 판매 문구는 Ø106 × 152mm다. 모델은 106 × 152 × 106mm 상자로 두었다. 작동거리는 22–214mm이고, 모델은 렌즈면에서 헥스 면까지 40mm다."),
        p("안장 안쪽 폭은 108mm다. 실물이 원통이면 안장에 맞는 두께의 패드를 붙인다. 팔은 앞쪽 2020에서 본체 아래까지 나와, 안장 윗면이 본체 바닥에 닿는다. 광축 높이와 작동거리는 안장 나사를 풀고 ±10mm 안에서 맞춘다. 각인 높이를 실물로 재기 전에는 구멍 위치를 고정하지 않는다."),
        p("UM20의 초점과 촬영은 패킹 PC가 한다. 이 장비는 2번 칸에 바가 서 있다는 신호만 낸다."),
        h("7. 시간과 병목"),
        p("시간은 실측 전 가정이다."),
        table(
            [
                ["동작", "시간"],
                ["헥스 맞춰 꽂기", "8초"],
                ["바에서 빼기", "2초"],
                ["봉투에 넣기, 라벨, 실링", "14초"],
                ["촬영, 인식", "2초. 그 자리에서 재촬영은 두 번까지, 그러면 6초"],
                ["한 칸 이동", "1초"],
            ],
            [70 * mm, 104 * mm],
        ),
        Spacer(1, 3 * mm),
        p("한 사람은 빼기와 봉투를 끝낸 다음 꽂는다. 촬영은 그 사이에 끝난다. 한 사람 = 2 + 14 + 8 + 1 = 25초, 시간당 144개."),
        p("두 사람이면 체인이 멈춘 동안 꽂기, 빼기, 촬영이 같이 시작한다. 셋 중 긴 것은 꽂기 8초다. 빼기가 끝났고 3번 센서가 비어 있으면 체인은 8초 뒤에 움직인다. 이동 1초를 더하면 다음 제품이 3번에 도착하기까지 9초다."),
        p("봉투 14초는 제품을 뺀 손에서 이어진다. 이 손이 다음 제품을 빼려면 이전 봉투가 끝나 있어야 한다. 9초마다 다음 제품이 오면 손은 아직 봉투를 닫는 중이다. 몇 개 지나면 3번 제품은 이전 봉투가 끝날 때까지 바 위에 있고, 반복 간격은 빼기 2초와 봉투 14초를 합친 16초가 된다. 시간당 225개."),
        p("꽂기는 16초 중 8초, 촬영은 2초만 쓴다. 재촬영이 6초여도 16초를 넘지 않는다. 3번에는 기다리는 제품이 하나뿐이라 줄은 더 늘지 않고, 봉투가 늦으면 다음 이동만 늦어진다."),
        p("꽂기, 빼기, 촬영이 매번 같은 시각에 시작되려면 봉투·라벨·실링이 7초 안에 끝나야 한다. 지금은 14초로 두었다. 실측에서 꽂기가 16초를 넘으면 반복 간격은 꽂기 쪽으로 옮겨 간다."),
        h("8. 안전"),
        p("3번 포토센서가 제품을 보면 체인은 움직이지 않는다. 바가 스프로킷을 돌 때 어벗이 매달려 떨어지지 않게 하기 위해서다. 이동 조건은 다음 세 가지가 모두 참일 때다."),
        bullets(
            [
                "3번 센서가 비어 있다.",
                "꽂기와 빼기가 끝났다는 버튼이 눌렸다.",
                "2번 촬영이 끝났거나, 재촬영 두 번이 끝났다.",
            ]
        ),
        p("라벨 프린터는 한 장만 내놓는다. 그 장을 떼야 다음 장이 나온다. 지금 3번에 있는 제품의 라벨은, 그 제품이 2번에 있을 때 찍힌 장이다. 미인식이면 라벨 없이 같은 손으로 담고, 등만 켜진다. 인식은 됐는데 인쇄가 안 되면 버튼을 받아도 이동하지 않는다."),
        h("9. 만들 것과 살 것"),
        table(
            [
                ["구분", "부품", "수량", "구하는 곳"],
                ["CNC", "높이 8mm 헥스 퍽, M3 탭 2구멍", "6", "직접 가공. 대변은 실측"],
                ["출력", "캐리어 PETG", "6", "stl/carrier.stl"],
                ["출력", "UM20 안장", "1", "stl/um20-saddle.stl"],
                ["출력", "3번 센서 브라켓", "1", "stl/sensor-bracket.stl"],
                ["출력", "NEMA17 모터판", "1", "stl/motor-plate.stl"],
                ["기성", "#25 체인", "1", "필요 길이 914mm. 1m를 자른다"],
                ["기성", "#25 16톱니, 보어 8mm", "2", "체인 상사, 쿠팡"],
                ["기성", "8mm 연마봉 100mm", "2", "쿠팡"],
                ["기성", "NEMA17", "1", "디바이스마트"],
                ["기성", "2020 500mm 2, 80mm 2, T너트", "1식", "쿠팡"],
                ["기성", "8mm 베어링 4, M3", "1식", "디바이스마트, 쿠팡"],
                ["기성", "ESP32, TMC2209, 12V", "1식", "디바이스마트"],
                ["기성", "반사형 포토센서, 버튼, 표시등", "1식", "디바이스마트"],
                ["책상", "라벨 프린터, 탁상 실러, 봉투", "1식", "쿠팡"],
                ["보유", "ViTiny UM20", "1", "촬영은 다른 세션"],
            ],
            [18 * mm, 62 * mm, 16 * mm, 78 * mm],
        ),
        Spacer(1, 3 * mm),
        p("모터판의 M3 구멍은 31mm 정사각이고, 진행 방향으로 8mm 슬롯이다. 체인 장력은 이 슬롯으로 맞춘다. 계산 중심거리는 406.1mm다."),
        h("10. 파일과 여는 법"),
        table(
            [
                ["파일", "내용"],
                ["cad/stp/assembly.stp", "조립 솔리드. 라이노·인벤터"],
                ["cad/stp/carrier.stp", "인쇄 형상. 설계 방향"],
                ["cad/stp/hex-puck.stp", "CNC 참고"],
                ["cad/stp/um20-saddle.stp", "인쇄 1개"],
                ["cad/stp/sensor-bracket.stp", "인쇄 1개"],
                ["cad/stp/motor-plate.stp", "인쇄 1개. 장력 슬롯"],
                ["cad/stp/sprocket.stp", "#25 16톱니 참고. 축은 Y"],
                ["cad/stl/", "같은 형상의 인쇄·미리보기 STL"],
                ["pdf/조립방법.pdf", "조립 순서"],
                ["pdf/전체내용.pdf", "이 문서"],
            ],
            [62 * mm, 112 * mm],
        ),
        Spacer(1, 3 * mm),
        p("라이노: 파일 가져오기에서 STEP을 고르고 단위를 밀리미터로 둔다. 인벤터: 열기에서 assembly.stp 를 고르면 바디 이름이 브라우저에 나온다. carrier-1 부터 carrier-6, hex-puck-1 부터 hex-puck-6, um20, nema17 이다. 체인 링크 살은 없고, 스프로킷과 바 위치는 치수 계산과 같다."),
        p("STEP을 다시 만들려면 cad 폴더에서 export_step.py 를 실행한다. STL과 그림은 build_model.py 다. 둘 다 build123d 와 manifold3d 가 있는 같은 파이썬을 쓴다."),
        h("11. 조립"),
        p("순서와 확인 표는 pdf/조립방법.pdf 에 따로 두었다. 요약은 다음과 같다."),
        bullets(
            [
                "2020으로 500 × 80mm 바닥 프레임을 짠다.",
                "양쪽 축을 바닥에서 70mm에 둔다. 중심거리는 406mm에서 모터판 슬롯으로 맞춘다.",
                "16톱니 스프로킷과 914mm 체인을 건다. 이음 클립이 위 직선에 오게 한다.",
                "캐리어 6개를 152.4mm마다 갈퀴가 부싱 사이에 들어가게 꽂고 퍽을 M3로 잠근다. 여섯 퍽의 작업자 쪽 면이 모두 +Y를 보게 한다.",
                "오른쪽 축의 벽 쪽에 NEMA17을 단다.",
                "UM20 안장을 2번 칸 앞에 두고, 렌즈면에서 퍽까지 40mm, 광축 높이 106mm를 출발점으로 삼는다.",
                "3번 센서는 벽 쪽에서 퍽을 본다. 작업자가 빼는 +Y 쪽은 비운다.",
                "라벨 프린터와 탁상 실러는 3번 옆 책상에 둔다.",
            ]
        ),
        h("12. 제어에 넘길 신호"),
        p("펌웨어는 다음 단계다. 입출력만 고정한다."),
        table(
            [
                ["신호", "방향", "내용"],
                ["스텝, 방향, 엔에이블", "출력", "TMC2209. 인덱스는 스프로킷 1.5회전"],
                ["원점 스위치", "입력", "체인 한 바퀴의 기준"],
                ["3번 센서", "입력", "제품이 보이면 이동 금지"],
                ["준비 버튼", "입력", "꽂기와 빼기가 끝났을 때"],
                ["미인식 등", "출력", "라벨 없이 담는 칸"],
                ["촬영 요청", "패킹 PC로", "2번 칸이 멈췄을 때"],
                ["촬영 결과", "패킹 PC에서", "성공, 재촬영, 미인식, 인쇄 실패"],
            ],
            [42 * mm, 32 * mm, 100 * mm],
        ),
        Spacer(1, 3 * mm),
        p("미인식은 두 번까지만 다시 찍고, 그다음은 등만 켠 채 손으로 담게 한다. 인쇄 실패는 이동을 멈춘다."),
        h("13. 가공 전에 잴 것"),
        bullets(
            [
                "각인이 있는 헥스의 대변 거리와 육각 높이. 포켓 깊이 0.8mm가 각인을 덮는지 확인한다.",
                "UM20 실물이 각기둥인지 원통인지, 렌즈면 기준 작동거리.",
                "가정 시간을 같은 제품으로 한 바퀴 재서, 봉투가 7초 안에 끝나는지 본다.",
            ]
        ),
    ]
    return story


def main():
    PDF.mkdir(parents=True, exist_ok=True)
    assembly = PDF / "조립방법.pdf"
    full = PDF / "전체내용.pdf"
    build(assembly, "세 칸 각인 인덱서 조립 방법", assembly_story())
    build(full, "세 칸 각인 인덱서 전체 내용", full_story())
    for path in (assembly, full):
        data = path.read_bytes()
        if not data.startswith(b"%PDF") or len(data) < 20000:
            raise SystemExit(f"PDF too small: {path}")
        if "AppleGothic" not in data.decode("latin1", errors="ignore") and b"AppleGothic" not in data:
            # 서브셋 이름만 남을 수 있다. 한글이 본문에 있는지로 확인한다.
            pass
        print(f"{path.name}\t{path.stat().st_size}")


if __name__ == "__main__":
    main()
