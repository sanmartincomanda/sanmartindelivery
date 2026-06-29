from __future__ import annotations

import json
import urllib.request
from datetime import datetime
from pathlib import Path

from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[2]
OUTPUT_DIR = ROOT / "output" / "pdf"
ASSETS_DIR = ROOT / "output" / "manual-assets"
TMP_DIR = ROOT / "tmp" / "pdfs" / "manual-assets"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
TMP_DIR.mkdir(parents=True, exist_ok=True)

PDF_PATH = OUTPUT_DIR / "Manual_Usuario_Tienda_Recompensas_San_Martin.pdf"

LOGO_PATH = ROOT / "public" / "tienda" / "branding" / "logo.png"

CATALOG_SNAPSHOT_URL = (
    "https://firebasestorage.googleapis.com/v0/b/"
    "tiendavirtual-2ced1.firebasestorage.app/o/storefront%2Fcatalog.json?alt=media"
)

SESSION_EMAIL = "carnessanmartingranada1@gmail.com"
SESSION_NAME = "Cliente Tienda Virtual"
SESSION_NOTE = (
    "Este manual usa una sesion simulada con la cuenta indicada por el usuario. "
    "Se documenta el flujo real de la tienda con un ejemplo de compra y canje."
)

SIMULATION = {
    "order_number": "TV-20260629-001",
    "product_name": "BISTEC CABEZA DE LOMO SB VP (E)",
    "product_code": "00440",
    "quantity_label": "1 lb",
    "subtotal": 215.00,
    "approx_total": 215.00,
    "points_earned": 21,
    "reward_name": "Torta Sabor Jalapeno",
    "reward_points": 750,
    "starting_points": 780,
    "points_after_redeem": 30,
    "final_points": 51,
}

REWARD_LEVELS = [
    {
        "points": 400,
        "name": "Paquete Torta Casera, 2 unidades",
        "code": "7434001100064",
        "note": "Premio inicial del programa.",
    },
    {
        "points": 750,
        "name": "Torta sabor Jalapeno o Chimichurri",
        "code": "7434001100934",
        "note": "Nivel usado en este ejemplo de canje.",
    },
    {
        "points": 1000,
        "name": "1 New York Steak 12 oz gratis",
        "code": "00047",
        "note": "Premio premium de corte.",
    },
    {
        "points": 1500,
        "name": "1 T-Bone 18 oz gratis",
        "code": "00052",
        "note": "Premio para seguir acumulando.",
    },
    {
        "points": 1750,
        "name": "1 Rib Eye Steak 12 oz gratis",
        "code": "00049",
        "note": "Uno de los premios estrella.",
    },
    {
        "points": 2500,
        "name": "Combo Premium San Martin",
        "code": "00049",
        "note": "Nivel alto con combo especial.",
    },
]

SCREENSHOT_SPECS = {
    "home": {
        "src": ASSETS_DIR / "10-home-current.png",
        "dst": TMP_DIR / "10-home-current-crop.png",
        "crop": ("top", 0.78),
    },
    "product": {
        "src": ASSETS_DIR / "11-product-current.png",
        "dst": TMP_DIR / "11-product-current-crop.png",
        "crop": ("top", 0.92),
    },
    "cart": {
        "src": ASSETS_DIR / "12-cart-current.png",
        "dst": TMP_DIR / "12-cart-current-crop.png",
        "crop": ("top", 0.96),
    },
    "success": {
        "src": ASSETS_DIR / "13-order-success.png",
        "dst": TMP_DIR / "13-order-success-crop.png",
        "crop": ("top", 0.58),
    },
}


def format_currency(value: float) -> str:
    return f"C$ {value:,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")


def fetch_catalog() -> dict[str, dict]:
    with urllib.request.urlopen(CATALOG_SNAPSHOT_URL) as response:
        payload = json.load(response)
    values = payload.values() if isinstance(payload, dict) else payload
    return {str(item.get("code", "")).strip(): item for item in values if str(item.get("code", "")).strip()}


def download_image(url: str, target_path: Path) -> Path | None:
    if not url:
        return None
    target_path.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url) as response:
        target_path.write_bytes(response.read())
    return target_path


def prepare_logo_image(source_path: Path, size_px: int = 320) -> Path:
    output_path = TMP_DIR / "logo-mark.png"
    image = PILImage.open(source_path).convert("RGBA")
    image.thumbnail((size_px, size_px))

    canvas = PILImage.new("RGBA", (size_px, size_px), (255, 255, 255, 0))
    offset_x = (size_px - image.width) // 2
    offset_y = (size_px - image.height) // 2
    canvas.paste(image, (offset_x, offset_y), image)
    canvas.save(output_path, format="PNG", optimize=True)
    return output_path


def crop_image(source_path: Path, target_path: Path, crop_spec: tuple[str, float] | None) -> Path:
    image = PILImage.open(source_path).convert("RGB")
    width, height = image.size

    if crop_spec:
        mode, factor = crop_spec
        factor = max(0.1, min(1.0, float(factor)))
        if mode == "top":
            crop_height = max(1, int(height * factor))
            image = image.crop((0, 0, width, crop_height))
        elif mode == "center":
            crop_height = max(1, int(height * factor))
            top = max(0, (height - crop_height) // 2)
            image = image.crop((0, top, width, top + crop_height))

    target_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(target_path, format="PNG", optimize=True)
    return target_path


def build_processed_assets() -> dict[str, Path]:
    processed = {}
    for key, spec in SCREENSHOT_SPECS.items():
        processed[key] = crop_image(spec["src"], spec["dst"], spec["crop"])
    return processed


def paragraph(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(text.replace("\n", "<br/>"), style)


def image_flowable(path: Path, width_mm: float) -> Image:
    flowable = Image(str(path))
    max_width = width_mm * mm
    ratio = flowable.imageHeight / max(1, flowable.imageWidth)
    flowable.drawWidth = max_width
    flowable.drawHeight = max_width * ratio
    return flowable


def build_reward_overview(catalog_by_code: dict[str, dict], styles: dict[str, ParagraphStyle]) -> Table:
    rows = []
    for reward in REWARD_LEVELS:
        product = catalog_by_code.get(reward["code"], {})
        image_url = str(product.get("image", "")).strip()
        image_path = TMP_DIR / "rewards" / f"{reward['code']}.jpg"
        local_image = download_image(image_url, image_path) if image_url else None
        image_cell = image_flowable(local_image, 18) if local_image and local_image.exists() else ""
        state = "Canjeado en este ejemplo" if reward["points"] == SIMULATION["reward_points"] else "Disponible mas adelante"
        rows.append(
            [
                image_cell,
                paragraph(f"<b>{reward['name']}</b><br/>{reward['note']}", styles["table_body"]),
                paragraph(f"{reward['points']} pts", styles["table_emphasis"]),
                paragraph(state, styles["table_body"]),
            ]
        )

    return Table(
        [["Imagen", "Premio", "Puntos", "Estado"]] + rows,
        colWidths=[24 * mm, 92 * mm, 24 * mm, 38 * mm],
        style=TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f4f90")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 9),
                ("ALIGN", (2, 1), (2, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("BACKGROUND", (0, 1), (-1, -1), colors.white),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#f6fbff"), colors.white]),
                ("GRID", (0, 0), (-1, -1), 0.6, colors.HexColor("#d5e4f5")),
                ("LEFTPADDING", (0, 0), (-1, -1), 7),
                ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        ),
    )


def build_document() -> None:
    catalog_by_code = fetch_catalog()
    processed = build_processed_assets()
    logo_png = prepare_logo_image(LOGO_PATH)

    styles = getSampleStyleSheet()
    brand_blue = colors.HexColor("#0c4b85")
    brand_blue_dark = colors.HexColor("#12345c")
    brand_red = colors.HexColor("#d92935")
    soft_blue = colors.HexColor("#eff6fd")
    dark_text = colors.HexColor("#102846")
    soft_text = colors.HexColor("#5b7290")

    custom = {
        "title": ParagraphStyle(
            "ManualTitle",
            parent=styles["Title"],
            fontName="Helvetica-Bold",
            fontSize=25,
            leading=29,
            textColor=brand_blue_dark,
            spaceAfter=8,
        ),
        "subtitle": ParagraphStyle(
            "ManualSubtitle",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=11,
            leading=15,
            textColor=soft_text,
            spaceAfter=5,
        ),
        "section": ParagraphStyle(
            "SectionTitle",
            parent=styles["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=18,
            leading=22,
            textColor=brand_blue,
            spaceAfter=8,
        ),
        "body": ParagraphStyle(
            "Body",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=10.2,
            leading=14,
            textColor=dark_text,
            spaceAfter=6,
        ),
        "small": ParagraphStyle(
            "Small",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=8.8,
            leading=11,
            textColor=soft_text,
            spaceAfter=4,
        ),
        "callout": ParagraphStyle(
            "Callout",
            parent=styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=10.3,
            leading=13,
            textColor=brand_blue_dark,
            spaceAfter=4,
        ),
        "table_body": ParagraphStyle(
            "TableBody",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=11,
            textColor=dark_text,
        ),
        "table_emphasis": ParagraphStyle(
            "TableEmphasis",
            parent=styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=8.8,
            leading=11,
            textColor=brand_red,
            alignment=1,
        ),
    }

    doc = SimpleDocTemplate(
        str(PDF_PATH),
        pagesize=A4,
        leftMargin=15 * mm,
        rightMargin=15 * mm,
        topMargin=15 * mm,
        bottomMargin=14 * mm,
        title="Manual de usuario - Delivery Carnes San Martin Granada",
        author="Codex",
    )

    story = []

    story.append(
        Table(
            [
                [
                    image_flowable(logo_png, 26),
                    [
                        paragraph("Manual sencillo de tienda virtual", custom["title"]),
                        paragraph("Delivery Carnes San Martin Granada", custom["subtitle"]),
                        paragraph(
                            f"Generado el {datetime.now().strftime('%d/%m/%Y')} con el flujo actual de tienda, carrito, recompensa y puntos.",
                            custom["body"],
                        ),
                    ],
                ]
            ],
            colWidths=[30 * mm, 145 * mm],
            style=TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                    ("TOPPADDING", (0, 0), (-1, -1), 0),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ]
            ),
        )
    )
    story.append(Spacer(1, 4 * mm))

    story.append(
        Table(
            [[
                paragraph(
                    "<b>Escenario documentado</b><br/>"
                    f"Cuenta simulada: <b>{SESSION_EMAIL}</b><br/>"
                    f"Cliente: <b>{SESSION_NAME}</b><br/>"
                    f"Pedido ejemplo: <b>{SIMULATION['order_number']}</b><br/>"
                    f"Premio usado: <b>{SIMULATION['reward_name']}</b><br/>"
                    f"Puntos iniciales: <b>{SIMULATION['starting_points']} pts</b><br/>"
                    f"Puntos finales tras canje y entrega: <b>{SIMULATION['final_points']} pts</b><br/><br/>"
                    f"{SESSION_NOTE}",
                    custom["body"],
                )
            ]],
            colWidths=[180 * mm],
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), soft_blue),
                    ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#cfe0f3")),
                    ("LEFTPADDING", (0, 0), (-1, -1), 12),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                    ("TOPPADDING", (0, 0), (-1, -1), 12),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
                ]
            ),
        )
    )
    story.append(Spacer(1, 5 * mm))
    story.append(paragraph("1. Inicio con sesion abierta", custom["section"]))
    story.append(
        paragraph(
            "La tienda abre mostrando promociones activas, buscador, categorias, subcategorias y el acceso al programa de recompensas. "
            "En este manual se parte de una sesion ya abierta para mostrar el flujo completo del cliente sin fricciones.",
            custom["body"],
        )
    )
    story.append(Spacer(1, 2 * mm))
    story.append(image_flowable(processed["home"], 180))
    story.append(Spacer(1, 2 * mm))
    story.append(paragraph("Vista movil de la tienda con el orden visual actual.", custom["small"]))

    story.append(PageBreak())

    story.append(paragraph("2. Seleccion del producto y armado del pedido", custom["section"]))
    story.append(
        paragraph(
            "El cliente toca el boton de agregar, revisa la ficha del producto, define el peso y guarda el articulo al carrito. "
            "En este ejemplo se usa un producto vendido por libra y luego se canjea un premio en el mismo pedido.",
            custom["body"],
        )
    )
    story.append(Spacer(1, 3 * mm))
    story.append(
        Table(
            [[image_flowable(processed["product"], 85), image_flowable(processed["cart"], 85)]],
            colWidths=[89 * mm, 89 * mm],
            style=TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                    ("TOPPADDING", (0, 0), (-1, -1), 0),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ]
            ),
        )
    )
    story.append(Spacer(1, 4 * mm))
    story.append(
        Table(
            [[
                paragraph(
                    "<b>Detalle del ejemplo</b><br/>"
                    f"Producto: <b>{SIMULATION['product_name']}</b><br/>"
                    f"Cantidad o peso: <b>{SIMULATION['quantity_label']}</b><br/>"
                    f"Subtotal estimado: <b>{format_currency(SIMULATION['subtotal'])}</b><br/>"
                    f"Total aproximado: <b>{format_currency(SIMULATION['approx_total'])}</b><br/>"
                    f"Premio canjeado en carrito: <b>{SIMULATION['reward_name']}</b><br/>"
                    f"Puntos que sumara el pedido al entregarse: <b>{SIMULATION['points_earned']} pts</b>",
                    custom["body"],
                )
            ]],
            colWidths=[180 * mm],
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                    ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#d2e1f3")),
                    ("LEFTPADDING", (0, 0), (-1, -1), 12),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                    ("TOPPADDING", (0, 0), (-1, -1), 12),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
                ]
            ),
        )
    )
    story.append(Spacer(1, 3 * mm))
    story.append(
        paragraph(
            "El premio se selecciona una sola vez por pedido. El cliente puede seguir acumulando si decide no canjearlo.",
            custom["small"],
        )
    )

    story.append(PageBreak())

    story.append(paragraph("3. Confirmacion, canje y acreditacion de puntos", custom["section"]))
    story.append(
        paragraph(
            "Al confirmar la compra, la app muestra el pedido realizado. Luego, cuando el pedido queda entregado y pagado, "
            "el sistema acredita los puntos ganados por el subtotal actualizado y deja registrado el canje del premio.",
            custom["body"],
        )
    )
    story.append(Spacer(1, 3 * mm))
    story.append(image_flowable(processed["success"], 92))
    story.append(Spacer(1, 4 * mm))

    points_table = Table(
        [
            ["Movimiento", "Puntos", "Saldo"],
            ["Saldo al abrir la sesion", f"{SIMULATION['starting_points']} pts", f"{SIMULATION['starting_points']} pts"],
            [f"Canje de {SIMULATION['reward_name']}", f"-{SIMULATION['reward_points']} pts", f"{SIMULATION['points_after_redeem']} pts"],
            [f"Pedido entregado {SIMULATION['order_number']}", f"+{SIMULATION['points_earned']} pts", f"{SIMULATION['final_points']} pts"],
        ],
        colWidths=[100 * mm, 34 * mm, 46 * mm],
        style=TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f4f90")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 8.5),
                ("BACKGROUND", (0, 1), (-1, -1), colors.white),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#f6fbff"), colors.white]),
                ("GRID", (0, 0), (-1, -1), 0.6, colors.HexColor("#d5e4f5")),
                ("FONTSIZE", (0, 1), (-1, -1), 8.5),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("ALIGN", (1, 1), (-1, -1), "CENTER"),
            ]
        ),
    )
    story.append(points_table)
    story.append(Spacer(1, 5 * mm))

    story.append(
        Table(
            [[
                paragraph(
                    "<b>Eventos del flujo completo</b><br/>"
                    "1. Sesion abierta en tienda.<br/>"
                    "2. Explora promociones, categorias y buscador.<br/>"
                    "3. Abre el producto y define el peso.<br/>"
                    "4. Guarda el producto al carrito.<br/>"
                    "5. Revisa puntos estimados del pedido.<br/>"
                    f"6. Canjea <b>{SIMULATION['reward_name']}</b>.<br/>"
                    "7. Confirma la compra.<br/>"
                    "8. La app muestra pedido realizado con exito.<br/>"
                    "9. Cocina y operacion preparan el pedido.<br/>"
                    "10. Al entregarse y pagarse, se acreditan los puntos.",
                    custom["body"],
                )
            ]],
            colWidths=[180 * mm],
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#fff8f8")),
                    ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#f0c9cf")),
                    ("LEFTPADDING", (0, 0), (-1, -1), 12),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                    ("TOPPADDING", (0, 0), (-1, -1), 12),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
                ]
            ),
        )
    )

    story.append(PageBreak())

    story.append(paragraph("4. Escalera actual de recompensas", custom["section"]))
    story.append(
        paragraph(
            "La tabla siguiente deja visible la escalera del programa y marca el nivel usado en esta simulacion. "
            "El cliente puede ver sus puntos, decidir si canjea ahora o si sigue acumulando para un premio mejor.",
            custom["body"],
        )
    )
    story.append(Spacer(1, 3 * mm))
    story.append(build_reward_overview(catalog_by_code, custom))
    story.append(Spacer(1, 5 * mm))
    story.append(
        Table(
            [[
                paragraph(
                    "<b>Resumen corto para compartir con el cliente</b><br/>"
                    "Miembro Gold San Martin Granada guarda el saldo de puntos, registra cada canje y acredita puntos solo cuando el pedido termina correctamente. "
                    "En este ejemplo el cliente tenia un premio activo, lo uso en el carrito y despues sumo puntos nuevos por la compra entregada.",
                    custom["body"],
                )
            ]],
            colWidths=[180 * mm],
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), soft_blue),
                    ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#cfe0f3")),
                    ("LEFTPADDING", (0, 0), (-1, -1), 12),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                    ("TOPPADDING", (0, 0), (-1, -1), 12),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
                ]
            ),
        )
    )

    def draw_page(canvas, doc_obj):
        canvas.saveState()
        canvas.setStrokeColor(colors.HexColor("#dbe7f5"))
        canvas.setLineWidth(1)
        canvas.line(doc_obj.leftMargin, 10 * mm, A4[0] - doc_obj.rightMargin, 10 * mm)
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.HexColor("#5c7598"))
        canvas.drawString(doc_obj.leftMargin, 6 * mm, "Delivery Carnes San Martin Granada")
        canvas.drawRightString(A4[0] - doc_obj.rightMargin, 6 * mm, f"Pagina {canvas.getPageNumber()}")
        canvas.restoreState()

    doc.build(story, onFirstPage=draw_page, onLaterPages=draw_page)


if __name__ == "__main__":
    build_document()
