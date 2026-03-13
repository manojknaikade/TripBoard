from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "output" / "pdf" / "tripboard-app-summary.pdf"


def bullet_paragraphs(items, style):
    paragraphs = []
    for item in items:
        paragraphs.append(
            Paragraph(
                f"<font color='#DC2626'>-</font> {item}",
                style,
            )
        )
    return paragraphs


def build_pdf():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=landscape(letter),
        leftMargin=0.45 * inch,
        rightMargin=0.45 * inch,
        topMargin=0.42 * inch,
        bottomMargin=0.42 * inch,
        title="TripBoard App Summary",
        author="OpenAI Codex",
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "Title",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=19,
        leading=22,
        textColor=colors.HexColor("#0F172A"),
        spaceAfter=8,
    )
    section_style = ParagraphStyle(
        "Section",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=10,
        leading=12,
        textColor=colors.HexColor("#DC2626"),
        spaceBefore=0,
        spaceAfter=4,
        uppercase=True,
    )
    body_style = ParagraphStyle(
        "Body",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=8.2,
        leading=10.2,
        textColor=colors.HexColor("#1F2937"),
        spaceAfter=0,
    )
    bullet_style = ParagraphStyle(
        "Bullet",
        parent=body_style,
        leftIndent=8,
        firstLineIndent=-8,
        spaceAfter=2,
    )
    small_style = ParagraphStyle(
        "Small",
        parent=body_style,
        fontSize=7.2,
        leading=8.6,
        textColor=colors.HexColor("#475569"),
    )

    left_story = [
        Paragraph("TripBoard", title_style),
        Paragraph(
            "TripBoard is a Next.js dashboard for Tesla vehicle monitoring, trip history, charging tracking, and driving analytics. "
            "Repo evidence shows it combines Tesla Fleet API access, Supabase-backed storage, interactive maps, charts, and optional telemetry-driven live status.",
            body_style,
        ),
        Spacer(1, 6),
        Paragraph("Who It's For", section_style),
        Paragraph(
            "Primary persona: a Tesla owner or operator who wants one place to monitor live vehicle state, review trips, track charging sessions and costs, and tune data collection preferences.",
            body_style,
        ),
        Spacer(1, 6),
        Paragraph("What It Does", section_style),
        *bullet_paragraphs(
            [
                "Shows live vehicle status, battery, range, climate, lock state, and map location on the dashboard.",
                "Lists trip history with date filters, route mini-maps, distance, duration, energy use, and efficiency metrics.",
                "Tracks charging sessions with location, charger type, energy added, battery delta, and user-entered cost/currency.",
                "Provides analytics views for distance, energy, efficiency by time of day, and charging mix over selectable time ranges.",
                "Supports Tesla OAuth plus direct API token entry for connecting a vehicle.",
                "Lets users export trip data as CSV or JSON and manage app settings such as units, region, polling, home location, and data source.",
                "Displays in-app notifications, including charging completion and daily trip summaries.",
            ],
            bullet_style,
        ),
    ]

    right_story = [
        Paragraph("How It Works", section_style),
        *bullet_paragraphs(
            [
                "<b>Frontend:</b> Next.js App Router pages under <font name='Courier'>src/app</font> render dashboard, trips, charging, analytics, auth, and settings views; maps use Leaflet and charts use Recharts.",
                "<b>Client state:</b> Zustand stores user preferences such as units, region, polling intervals, currency, notifications, home location, and whether data comes from polling or telemetry.",
                "<b>Server layer:</b> Next.js API routes handle Tesla OAuth, Tesla Fleet API requests, trip/charging/settings CRUD, exports, geocoding, vehicle status, and notifications.",
                "<b>Data layer:</b> Supabase stores <font name='Courier'>user_settings</font>, <font name='Courier'>trips</font>, <font name='Courier'>charging_sessions</font>, <font name='Courier'>vehicle_status</font>, <font name='Courier'>telemetry_raw</font>, and <font name='Courier'>notifications</font>.",
                "<b>Data flow:</b> UI calls app API routes; routes either query Tesla Fleet API directly or read processed telemetry/status from Supabase; results are shaped for the dashboard and history pages.",
                "<b>Telemetry path:</b> Repo docs and scripts describe an external Go ingester receiving Tesla telemetry and writing JSON to Supabase, while database triggers in Supabase derive trips and charging sessions from raw telemetry.",
            ],
            bullet_style,
        ),
        Spacer(1, 6),
        Paragraph("How To Run", section_style),
        *bullet_paragraphs(
            [
                "Install dependencies: <font name='Courier'>npm install</font>.",
                "Create <font name='Courier'>.env.local</font> from repo examples and set Supabase URL/key, Tesla client ID/secret, redirect URI, and token encryption key.",
                "Run the SQL setup in Supabase from <font name='Courier'>supabase/schema.sql</font> and <font name='Courier'>supabase/migrations/</font>, then initialize the default app settings row if needed.",
                "Start the app with <font name='Courier'>npm run dev</font> and open <font name='Courier'>http://localhost:3000</font>.",
                "Optional for telemetry mode: follow <font name='Courier'>TELEMETRY_SETUP.md</font> and related scripts to feed live telemetry into Supabase.",
            ],
            bullet_style,
        ),
        Spacer(1, 6),
        Paragraph("Repo Gaps", section_style),
        Paragraph("No key summary item above required a repo-gap fallback; all sections were supported by files in this repository.", small_style),
    ]

    frame = Table(
        [[left_story, right_story]],
        colWidths=[5.0 * inch, 4.2 * inch],
        hAlign="LEFT",
    )
    frame.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#F8FAFC")),
                ("BACKGROUND", (1, 0), (1, 0), colors.HexColor("#FFFFFF")),
                ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#CBD5E1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.6, colors.HexColor("#E2E8F0")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 14),
                ("RIGHTPADDING", (0, 0), (-1, -1), 14),
                ("TOPPADDING", (0, 0), (-1, -1), 14),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
            ]
        )
    )

    doc.build([frame])


if __name__ == "__main__":
    build_pdf()
