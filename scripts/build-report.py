#!/usr/bin/env python3
"""Build the course report PDF from docs/report.md with ReportLab."""

from __future__ import annotations

import html
import re
from pathlib import Path

from PIL import Image as PillowImage
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image,
    KeepTogether,
    ListFlowable,
    ListItem,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    XPreformatted,
)
from reportlab.platypus.tableofcontents import TableOfContents

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "report.md"
OUTPUT = ROOT / "output" / "pdf" / "SecureDesk-raport.pdf"

PAGE_WIDTH, PAGE_HEIGHT = A4
LEFT = 20 * mm
RIGHT = 18 * mm
TOP = 18 * mm
BOTTOM = 18 * mm
CONTENT_WIDTH = PAGE_WIDTH - LEFT - RIGHT

ARIAL = Path("/System/Library/Fonts/Supplemental/Arial.ttf")
ARIAL_BOLD = Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf")
ARIAL_ITALIC = Path("/System/Library/Fonts/Supplemental/Arial Italic.ttf")
ARIAL_MONO = Path("/System/Library/Fonts/Monaco.ttf")

pdfmetrics.registerFont(TTFont("Report", str(ARIAL)))
pdfmetrics.registerFont(TTFont("Report-Bold", str(ARIAL_BOLD)))
pdfmetrics.registerFont(TTFont("Report-Italic", str(ARIAL_ITALIC)))
pdfmetrics.registerFont(TTFont("Report-Mono", str(ARIAL_MONO)))
pdfmetrics.registerFontFamily(
    "Report", normal="Report", bold="Report-Bold", italic="Report-Italic"
)

ACCENT = colors.HexColor("#005B96")
ACCENT_DARK = colors.HexColor("#14324A")
LIGHT_BLUE = colors.HexColor("#EAF4FA")
LIGHT_GRAY = colors.HexColor("#F4F6F8")
MID_GRAY = colors.HexColor("#66737F")


def create_styles():
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            "ReportBody",
            fontName="Report",
            fontSize=9.4,
            leading=13.2,
            textColor=colors.HexColor("#1F2933"),
            spaceAfter=5.5,
            alignment=TA_LEFT,
            allowWidows=0,
            allowOrphans=0,
        )
    )
    styles.add(
        ParagraphStyle(
            "ReportH1",
            parent=styles["ReportBody"],
            fontName="Report-Bold",
            fontSize=20,
            leading=24,
            textColor=ACCENT_DARK,
            spaceBefore=8,
            spaceAfter=12,
            keepWithNext=True,
        )
    )
    styles.add(
        ParagraphStyle(
            "ReportH2",
            parent=styles["ReportBody"],
            fontName="Report-Bold",
            fontSize=13.5,
            leading=17,
            textColor=ACCENT,
            spaceBefore=9,
            spaceAfter=6,
            keepWithNext=True,
        )
    )
    styles.add(
        ParagraphStyle(
            "ReportH3",
            parent=styles["ReportBody"],
            fontName="Report-Bold",
            fontSize=10.5,
            leading=14,
            textColor=ACCENT_DARK,
            spaceBefore=7,
            spaceAfter=4,
            keepWithNext=True,
        )
    )
    styles.add(
        ParagraphStyle(
            "ReportBullet",
            parent=styles["ReportBody"],
            leftIndent=5 * mm,
            firstLineIndent=0,
            spaceAfter=2,
        )
    )
    styles.add(
        ParagraphStyle(
            "ReportCode",
            fontName="Report-Mono",
            fontSize=6.8,
            leading=9.1,
            textColor=colors.HexColor("#15202B"),
            backColor=LIGHT_GRAY,
            borderColor=colors.HexColor("#D9E0E6"),
            borderWidth=0.5,
            borderPadding=6,
            spaceBefore=4,
            spaceAfter=7,
        )
    )
    styles.add(
        ParagraphStyle(
            "ReportCaption",
            parent=styles["ReportBody"],
            fontName="Report-Italic",
            fontSize=8,
            leading=10,
            textColor=MID_GRAY,
            alignment=TA_CENTER,
            spaceBefore=3,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            "CoverTitle",
            fontName="Report-Bold",
            fontSize=34,
            leading=39,
            textColor=ACCENT_DARK,
            alignment=TA_CENTER,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            "CoverSubtitle",
            fontName="Report",
            fontSize=16,
            leading=21,
            textColor=ACCENT,
            alignment=TA_CENTER,
            spaceAfter=10,
        )
    )
    styles.add(
        ParagraphStyle(
            "CoverMeta",
            fontName="Report",
            fontSize=10.5,
            leading=16,
            textColor=colors.HexColor("#334E68"),
            alignment=TA_CENTER,
        )
    )
    return styles


STYLES = create_styles()


def inline_markup(text: str) -> str:
    text = text.replace("–", "-").replace("—", "-").replace("‑", "-")
    safe = html.escape(text, quote=False)
    safe = re.sub(r"`([^`]+)`", r'<font name="Report-Mono">\1</font>', safe)
    safe = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", safe)
    safe = re.sub(
        r"(https://[^\s<]+)",
        r'<link href="\1" color="#005B96"><u>\1</u></link>',
        safe,
    )
    return safe


class ReportDocument(BaseDocTemplate):
    def __init__(self, filename: str):
        super().__init__(
            filename,
            pagesize=A4,
            leftMargin=LEFT,
            rightMargin=RIGHT,
            topMargin=TOP,
            bottomMargin=BOTTOM,
            title="SecureDesk - raport z realizacji modułu uwierzytelniania i autoryzacji",
            author="Igor",
            subject="Cybersecurity course report, variant 2",
        )
        cover = Frame(LEFT, BOTTOM, CONTENT_WIDTH, PAGE_HEIGHT - TOP - BOTTOM, id="cover")
        body = Frame(LEFT, BOTTOM, CONTENT_WIDTH, PAGE_HEIGHT - TOP - BOTTOM, id="body")
        self.addPageTemplates(
            [
                PageTemplate(id="Cover", frames=[cover], onPage=self.draw_cover),
                PageTemplate(id="Body", frames=[body], onPage=self.draw_body),
            ]
        )
        self._heading_counter = 0

    def beforeDocument(self):
        self._heading_counter = 0

    def draw_cover(self, canvas, doc):
        canvas.saveState()
        canvas.setFillColor(ACCENT_DARK)
        canvas.rect(0, PAGE_HEIGHT - 12 * mm, PAGE_WIDTH, 12 * mm, fill=1, stroke=0)
        canvas.setFillColor(ACCENT)
        canvas.rect(0, 0, PAGE_WIDTH, 7 * mm, fill=1, stroke=0)
        canvas.restoreState()

    def draw_body(self, canvas, doc):
        canvas.saveState()
        canvas.setStrokeColor(colors.HexColor("#D7E1E8"))
        canvas.line(LEFT, PAGE_HEIGHT - 11 * mm, PAGE_WIDTH - RIGHT, PAGE_HEIGHT - 11 * mm)
        canvas.setFont("Report", 7.5)
        canvas.setFillColor(MID_GRAY)
        canvas.drawString(LEFT, PAGE_HEIGHT - 8.5 * mm, "SecureDesk | raport bezpieczeństwa")
        canvas.drawRightString(PAGE_WIDTH - RIGHT, 9 * mm, f"Strona {doc.page}")
        canvas.restoreState()

    def afterFlowable(self, flowable):
        if not isinstance(flowable, Paragraph):
            return
        style = flowable.style.name
        if style not in {"ReportH1", "ReportH2"}:
            return
        level = 0 if style == "ReportH1" else 1
        text = flowable.getPlainText()
        self._heading_counter += 1
        key = f"heading-{self._heading_counter}"
        self.canv.bookmarkPage(key)
        self.canv.addOutlineEntry(text, key, level=level, closed=False)
        self.notify("TOCEntry", (level, text, self.page, key))


def cover_story():
    return [
        Spacer(1, 42 * mm),
        Paragraph("SecureDesk", STYLES["CoverTitle"]),
        Paragraph(
            "Raport z realizacji modułu<br/>uwierzytelniania i autoryzacji",
            STYLES["CoverSubtitle"],
        ),
        Spacer(1, 8 * mm),
        Table(
            [
                ["Wariant", "2"],
                ["Autor", "Igor"],
                ["Data", "25.10.2026"],
                ["Repozytorium", "github.com/IgorK834/SecureDesk"],
            ],
            colWidths=[35 * mm, 90 * mm],
            hAlign="CENTER",
            style=TableStyle(
                [
                    ("FONTNAME", (0, 0), (-1, -1), "Report"),
                    ("FONTNAME", (0, 0), (0, -1), "Report-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 10),
                    ("TEXTCOLOR", (0, 0), (-1, -1), ACCENT_DARK),
                    ("BACKGROUND", (0, 0), (0, -1), LIGHT_BLUE),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#C4D5E0")),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("TOPPADDING", (0, 0), (-1, -1), 7),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                ]
            ),
        ),
        Spacer(1, 25 * mm),
        Paragraph(
            "Angular 22 | Next.js API | SQLite | Argon2id | RBAC | CSRF | Playwright",
            STYLES["CoverMeta"],
        ),
        NextPageTemplate("Body"),
        PageBreak(),
        Paragraph("Spis treści", STYLES["ReportH1"]),
        Spacer(1, 4 * mm),
        TableOfContents(
            levelStyles=[
                ParagraphStyle(
                    "TOC1",
                    fontName="Report-Bold",
                    fontSize=9.5,
                    leading=14,
                    leftIndent=0,
                    firstLineIndent=0,
                    textColor=ACCENT_DARK,
                ),
                ParagraphStyle(
                    "TOC2",
                    fontName="Report",
                    fontSize=8.5,
                    leading=12,
                    leftIndent=8 * mm,
                    firstLineIndent=0,
                    textColor=colors.HexColor("#334E68"),
                ),
            ]
        ),
        PageBreak(),
    ]


def parse_table(lines: list[str]):
    rows = []
    for line in lines:
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        rows.append(cells)
    rows.pop(1)
    col_count = max(len(row) for row in rows)
    normalized = [row + [""] * (col_count - len(row)) for row in rows]
    data = [
        [Paragraph(inline_markup(cell), STYLES["ReportBody"]) for cell in row]
        for row in normalized
    ]
    col_widths = [CONTENT_WIDTH / col_count] * col_count
    return Table(
        data,
        colWidths=col_widths,
        repeatRows=1,
        hAlign="LEFT",
        style=TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), ACCENT_DARK),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Report-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 7.5),
                ("LEADING", (0, 0), (-1, -1), 9.5),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CBD5DC")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_GRAY]),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        ),
    )


def report_image(alt: str, relative: str):
    path = (SOURCE.parent / relative).resolve()
    with PillowImage.open(path) as source_image:
        width, height = source_image.size
    max_width = CONTENT_WIDTH
    max_height = 182 * mm
    scale = min(max_width / width, max_height / height)
    image = Image(str(path), width=width * scale, height=height * scale)
    image.hAlign = "CENTER"
    return KeepTogether(
        [image, Paragraph(inline_markup(alt), STYLES["ReportCaption"])]
    )


def parse_markdown(lines: list[str]):
    story = []
    paragraph: list[str] = []
    bullets: list[str] = []
    code: list[str] = []
    in_code = False
    major_seen = False

    def flush_paragraph():
        nonlocal paragraph
        if paragraph:
            story.append(Paragraph(inline_markup(" ".join(paragraph)), STYLES["ReportBody"]))
            paragraph = []

    def flush_bullets():
        nonlocal bullets
        if bullets:
            items = [
                ListItem(Paragraph(inline_markup(item), STYLES["ReportBullet"]))
                for item in bullets
            ]
            story.append(
                ListFlowable(
                    items,
                    bulletType="bullet",
                    start="circle",
                    leftIndent=6 * mm,
                    bulletFontName="Report",
                    bulletFontSize=7,
                    spaceAfter=5,
                )
            )
            bullets = []

    i = 0
    while i < len(lines):
        raw = lines[i].rstrip("\n")
        stripped = raw.strip()
        if stripped.startswith("```"):
            flush_paragraph()
            flush_bullets()
            if in_code:
                story.append(XPreformatted(html.escape("\n".join(code)), STYLES["ReportCode"]))
                code = []
                in_code = False
            else:
                in_code = True
            i += 1
            continue
        if in_code:
            code.append(raw.replace("–", "-").replace("—", "-").replace("‑", "-"))
            i += 1
            continue

        image_match = re.fullmatch(r"!\[([^]]+)]\(([^)]+)\)", stripped)
        if image_match:
            flush_paragraph()
            flush_bullets()
            if "04b-admin-security-settings" in image_match.group(2):
                story.append(PageBreak())
            story.append(report_image(image_match.group(1), image_match.group(2)))
            i += 1
            continue

        if stripped.startswith("|") and i + 1 < len(lines) and re.match(
            r"^\s*\|?\s*:?-+", lines[i + 1]
        ):
            flush_paragraph()
            flush_bullets()
            table_lines = [raw, lines[i + 1].rstrip("\n")]
            i += 2
            while i < len(lines) and lines[i].strip().startswith("|"):
                table_lines.append(lines[i].rstrip("\n"))
                i += 1
            story.append(parse_table(table_lines))
            story.append(Spacer(1, 4 * mm))
            continue

        heading = re.match(r"^(#{1,3})\s+(.+)$", stripped)
        if heading:
            flush_paragraph()
            flush_bullets()
            level = len(heading.group(1))
            title = heading.group(2)
            if level == 2 and (title == "2.4. Schemat ER" or re.match(r"^3\.[2-7]\.", title)):
                story.append(PageBreak())
            if level == 1:
                if major_seen:
                    story.append(PageBreak())
                major_seen = True
                style = STYLES["ReportH1"]
            elif level == 2:
                style = STYLES["ReportH2"]
            else:
                style = STYLES["ReportH3"]
            story.append(Paragraph(inline_markup(title), style))
            i += 1
            continue

        if stripped.startswith("- "):
            flush_paragraph()
            bullets.append(stripped[2:])
            i += 1
            continue

        if stripped == "":
            flush_paragraph()
            flush_bullets()
        else:
            paragraph.append(stripped.rstrip("  "))
        i += 1

    flush_paragraph()
    flush_bullets()
    return story


def main():
    source_lines = SOURCE.read_text(encoding="utf-8").splitlines()
    start = source_lines.index("## Streszczenie")
    story = cover_story() + parse_markdown(source_lines[start:])
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    document = ReportDocument(str(OUTPUT))
    document.multiBuild(story)
    print(OUTPUT)


if __name__ == "__main__":
    main()
