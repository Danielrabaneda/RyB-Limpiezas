"""Generate an evidence report, deliberately separate from legal certification."""
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output/pdf/Informe_pruebas_LimpiaGest_Verifactu_2026-08-30.pdf"
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="ReportTitle", fontName="Helvetica-Bold", fontSize=20, leading=24, textColor=colors.HexColor("#143754"), spaceAfter=9))
styles.add(ParagraphStyle(name="ReportBody", fontName="Helvetica", fontSize=10, leading=12.5, spaceAfter=6))
styles.add(ParagraphStyle(name="ReportSection", fontName="Helvetica-Bold", fontSize=12, leading=15, textColor=colors.HexColor("#143754"), spaceBefore=8, spaceAfter=5))
styles.add(ParagraphStyle(name="ReportSmall", fontName="Helvetica", fontSize=8.5, leading=11, spaceAfter=6))
styles.add(ParagraphStyle(name="ReportAlert", fontName="Helvetica-Bold", fontSize=10, leading=14, textColor=colors.HexColor("#8a4a00"), spaceAfter=9))

def p(text, style="ReportBody"):
    return Paragraph(text, styles[style])

story = [
    p("LimpiaGest | VeriFactu", "ReportSmall"),
    p("Informe de pruebas de integración", "ReportTitle"),
    p("ENTORNO DE PRUEBAS - NO HABILITA PRODUCCIÓN", "ReportAlert"),
    p("Empresa: <b>LIMPIEZAS RAIBA SOCIEDAD LIMITADA</b><br/>NIF: <b>B04843843</b><br/>Fecha de recopilación de evidencias: <b>30/08/2026</b>"),
    p("1. Objeto y alcance", "ReportSection"),
    p("Este informe recoge los resultados observados y documentados durante las pruebas de integración de LimpiaGest con el servicio VeriFactu de pruebas de la AEAT. No es una declaración responsable del productor, una auditoría independiente ni una certificación de la AEAT. Su firma no acredita el cumplimiento integral del sistema."),
    p("2. Ciclo controlado aceptado", "ReportSection"),
    p("Registro de prueba: <b>TEST-VF-2026-0002</b>. Fecha de expedición: 31/07/2026. Base: 1,00 EUR; IVA: 0,21 EUR; total: <b>1,21 EUR</b>. Numeración de prueba separada de las series reales."),
]
rows = [[p("Operación", "ReportSmall"), p("Estado observado", "ReportSmall"), p("Intentos", "ReportSmall")]]
rows += [[p(op), p("Aceptado en pruebas"), p("1")] for op in ["Alta", "Subsanación", "Anulación"]]
table = Table(rows, colWidths=[44*mm, 88*mm, 30*mm], hAlign="LEFT")
table.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#e8f0f7")),
    ("VALIGN", (0,0), (-1,-1), "TOP"),
    ("LEFTPADDING", (0,0), (-1,-1), 9),
    ("TOPPADDING", (0,0), (-1,-1), 4),
    ("BOTTOMPADDING", (0,0), (-1,-1), 3),
    ("LINEBELOW", (0,0), (-1,-1), .4, colors.HexColor("#dbe4ec")),
]))
story += [table, Spacer(1, 8),
    p("Las tres operaciones terminaron sin mensaje de error en la cola. La subsanación cambió únicamente el nombre del cliente de CLIENTE PRUEBA SUBSANACION a CLIENTE PRUEBA SUBSANACION CORREGIDO; mantuvo el NIF y los importes."),
    p("3. Evidencias complementarias y límites", "ReportSection"),
    p("El cotejo del QR de TEST-VF-2026-0001 mostró «Encontrada» en la sede de pruebas, con NIF, número, fecha e importe coincidentes. Tras cerrar el segundo ciclo, el panel mostró 0,00 EUR facturados, cobrados y pendientes, y tres facturas anuladas."),
    p("Se conservaron los registros históricos con errores, incluidas incidencias anteriores de huella, duplicidad y hora de generación. Este informe no los oculta ni declara superados todos los escenarios posibles. No contiene nuevas remisiones a la AEAT ni autoriza envíos reales."),
    p("Trazabilidad: documentación interna docs/VERIFACTU_STATUS.md; correcciones de flujo de subsanación y envío: de59240; cierre documental del ciclo: 1844b14. Este resumen no sustituye a los XML y respuestas originales conservados por la aplicación.", "ReportSmall"),
]

signature = Table([
    [p("Nombre y apellidos", "ReportSmall"), p("Fecha", "ReportSmall")],
    ["", ""],
    [p("Firma manuscrita", "ReportSmall"), ""],
    ["", ""],
], colWidths=[116*mm, 46*mm], rowHeights=[7*mm, 9*mm, 7*mm, 18*mm], hAlign="LEFT")
signature.setStyle(TableStyle([
    ("SPAN", (0,2), (-1,2)),
    ("SPAN", (0,3), (-1,3)),
    ("VALIGN", (0,0), (-1,-1), "TOP"),
    ("LEFTPADDING", (0,0), (-1,-1), 8),
    ("TOPPADDING", (0,0), (-1,-1), 4),
    ("BOX", (0,0), (-1,-1), .6, colors.HexColor("#a6b6c4")),
    ("LINEBELOW", (0,1), (-1,1), .6, colors.HexColor("#a6b6c4")),
    ("LINEAFTER", (0,0), (0,1), .6, colors.HexColor("#a6b6c4")),
]))
story.append(KeepTogether([
    p("4. Firma y conservación", "ReportSection"),
    p("Con mi firma dejo constancia de la revisión de este informe, limitado a las evidencias descritas. Producción permanece bloqueada y la declaración responsable definitiva sigue pendiente. Una copia escaneada de este documento firmado a mano no contiene una firma electrónica del PDF."),
    Spacer(1, 3),
    signature,
]))

def footer(canvas, doc):
    canvas.setStrokeColor(colors.HexColor("#dbe4ec"))
    canvas.line(22*mm, 17*mm, 188*mm, 17*mm)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#536779"))
    canvas.drawString(22*mm, 12*mm, "Informe de evidencias | Exclusivamente pruebas")
    canvas.drawRightString(188*mm, 12*mm, str(doc.page))

doc = SimpleDocTemplate(str(OUTPUT), pagesize=(210*mm,297*mm), rightMargin=22*mm, leftMargin=22*mm, topMargin=14*mm, bottomMargin=20*mm, title="Informe de pruebas de integración VeriFactu - LimpiaGest", author="LimpiaGest")
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print(OUTPUT)
