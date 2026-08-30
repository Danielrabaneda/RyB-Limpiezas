from pathlib import Path
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.section import WD_SECTION
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

OUT = Path(r"C:\Proyectos\RyB app\docs\legal\Declaracion_responsable_LimpiaGest_VERIFACTU_BORRADOR.docx")
OUT.parent.mkdir(parents=True, exist_ok=True)

BLUE = "2E74B5"
DARK = "1F4D78"
MUTED = "667085"
LIGHT = "F2F4F7"
CAUTION = "FFF4CE"
RED = "9B1C1C"


def set_font(run, size=11, bold=False, color="000000", italic=False):
    run.font.name = "Calibri"
    run._element.get_or_add_rPr().rFonts.set(qn("w:ascii"), "Calibri")
    run._element.get_or_add_rPr().rFonts.set(qn("w:hAnsi"), "Calibri")
    run.font.size = Pt(size)
    run.bold = bold
    run.italic = italic
    run.font.color.rgb = RGBColor.from_string(color)


def shade(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_width(cell, dxa):
    tc_pr = cell._tc.get_or_add_tcPr()
    tc_w = tc_pr.find(qn("w:tcW"))
    if tc_w is None:
        tc_w = OxmlElement("w:tcW")
        tc_pr.append(tc_w)
    tc_w.set(qn("w:w"), str(dxa))
    tc_w.set(qn("w:type"), "dxa")


def set_table_geometry(table, widths):
    table.autofit = False
    tbl_pr = table._tbl.tblPr
    tbl_w = tbl_pr.find(qn("w:tblW"))
    if tbl_w is None:
        tbl_w = OxmlElement("w:tblW")
        tbl_pr.append(tbl_w)
    tbl_w.set(qn("w:w"), str(sum(widths)))
    tbl_w.set(qn("w:type"), "dxa")
    tbl_ind = tbl_pr.find(qn("w:tblInd"))
    if tbl_ind is None:
        tbl_ind = OxmlElement("w:tblInd")
        tbl_pr.append(tbl_ind)
    tbl_ind.set(qn("w:w"), "120")
    tbl_ind.set(qn("w:type"), "dxa")
    grid = table._tbl.tblGrid
    for child in list(grid):
        grid.remove(child)
    for width in widths:
        col = OxmlElement("w:gridCol")
        col.set(qn("w:w"), str(width))
        grid.append(col)
    for row in table.rows:
        for i, cell in enumerate(row.cells):
            set_cell_width(cell, widths[i])
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            tc_pr = cell._tc.get_or_add_tcPr()
            mar = tc_pr.find(qn("w:tcMar"))
            if mar is None:
                mar = OxmlElement("w:tcMar")
                tc_pr.append(mar)
            for side, value in (("top", 80), ("bottom", 80), ("start", 120), ("end", 120)):
                el = mar.find(qn(f"w:{side}"))
                if el is None:
                    el = OxmlElement(f"w:{side}")
                    mar.append(el)
                el.set(qn("w:w"), str(value))
                el.set(qn("w:type"), "dxa")


def add_kv_table(doc, rows):
    table = doc.add_table(rows=0, cols=2)
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
    for label, value in rows:
        cells = table.add_row().cells
        cells[0].text = label
        cells[1].text = value
        shade(cells[0], LIGHT)
        for run in cells[0].paragraphs[0].runs:
            set_font(run, bold=True, color=DARK)
        for run in cells[1].paragraphs[0].runs:
            set_font(run)
    set_table_geometry(table, [2700, 6660])
    doc.add_paragraph().paragraph_format.space_after = Pt(0)
    return table


def add_callout(doc, title, text, fill=CAUTION, color=RED):
    table = doc.add_table(rows=1, cols=1)
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
    cell = table.cell(0, 0)
    shade(cell, fill)
    p = cell.paragraphs[0]
    r = p.add_run(title + " ")
    set_font(r, bold=True, color=color)
    r = p.add_run(text)
    set_font(r)
    set_table_geometry(table, [9360])
    doc.add_paragraph().paragraph_format.space_after = Pt(0)


doc = Document()
section = doc.sections[0]
section.page_width = Inches(8.5)
section.page_height = Inches(11)
section.top_margin = Inches(1)
section.right_margin = Inches(1)
section.bottom_margin = Inches(1)
section.left_margin = Inches(1)
section.header_distance = Inches(0.492)
section.footer_distance = Inches(0.492)

normal = doc.styles["Normal"]
normal.font.name = "Calibri"
normal.font.size = Pt(11)
normal.paragraph_format.space_before = Pt(0)
normal.paragraph_format.space_after = Pt(6)
normal.paragraph_format.line_spacing = 1.10
for name, size, before, after, color in (
    ("Heading 1", 16, 16, 8, BLUE),
    ("Heading 2", 13, 12, 6, BLUE),
    ("Heading 3", 12, 8, 4, DARK),
):
    style = doc.styles[name]
    style.font.name = "Calibri"
    style.font.size = Pt(size)
    style.font.bold = True
    style.font.color.rgb = RGBColor.from_string(color)
    style.paragraph_format.space_before = Pt(before)
    style.paragraph_format.space_after = Pt(after)

header = section.header.paragraphs[0]
header.text = "LIMPIAGEST | EXPEDIENTE VERI*FACTU"
header.alignment = WD_ALIGN_PARAGRAPH.RIGHT
for run in header.runs:
    set_font(run, size=8.5, color=MUTED)
footer = section.footer.paragraphs[0]
footer.text = "Borrador sujeto a revisión jurídica y firma del productor"
footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
for run in footer.runs:
    set_font(run, size=8.5, color=MUTED, italic=True)

p = doc.add_paragraph()
p.paragraph_format.space_before = Pt(16)
p.paragraph_format.space_after = Pt(4)
r = p.add_run("DECLARACIÓN RESPONSABLE DEL SISTEMA INFORMÁTICO DE FACTURACIÓN")
set_font(r, size=22, bold=True)
p = doc.add_paragraph()
p.paragraph_format.space_after = Pt(14)
r = p.add_run("LimpiaGest · versión 1.0.1 · BORRADOR PARA REVISIÓN Y FIRMA")
set_font(r, size=13, color=MUTED)

add_callout(
    doc,
    "NO FIRMAR TODAVÍA.",
    "Evidencias actualizadas a 30/08/2026: alta, subsanación y anulación del caso TEST-VF-2026-0002 aceptadas sin errores. Esto no certifica el cierre legal. Quedan la revisión independiente y la versión comercial exclusiva VERI*FACTU. La producción permanece bloqueada.",
)

doc.add_heading("1. Información obligatoria", level=1)
add_kv_table(doc, [
    ("a) Nombre del sistema informático", "LimpiaGest"),
    ("b) Código identificador", "LG"),
    ("c) Versión", "1.0.1 (candidata; sustituir por la versión exacta del lanzamiento)"),
    ("d) Componentes y funcionalidades", "Aplicación web React; servicios Firebase/Google Cloud; Firestore; funciones de emisión fiscal; generación de PDF y QR; cola AEAT; conector Windows para certificados no exportables; custodia alternativa PFX/P12 mediante Secret Manager. Gestiona facturas, huellas, encadenamiento, altas, anulaciones, subsanaciones, reintentos y respuestas AEAT."),
    ("e) Funcionamiento exclusivo VERI*FACTU", "PENDIENTE DE CIERRE: la edición comercial deberá impedir la emisión fiscal con el modo desactivado. Una vez aplicado ese bloqueo, indicar SÍ."),
    ("f) Uso por varios obligados tributarios", "SÍ. Arquitectura multiempresa con separación lógica y control de acceso por entidad; cada instalación/tenant mantiene su propia numeración, cadena, certificado y cola."),
    ("g) Tipos de firma de registros", "No aplicable en modalidad exclusiva VERI*FACTU. El certificado del obligado tributario se utiliza para autenticación mutua TLS en la remisión a la AEAT; los registros se protegen mediante huella SHA-256 y encadenamiento."),
    ("h) Productor", "LIMPIEZAS RAIBA SOCIEDAD LIMITADA"),
    ("i) NIF del productor", "B04843843"),
    ("j) Dirección postal", "C/ Algarrobo 0, 04740 Roquetas de Mar, Almería, España"),
])

doc.add_heading("2. Manifestación de cumplimiento", level=1)
p = doc.add_paragraph()
p.add_run("k) ").bold = True
p.add_run(
    "La entidad productora manifiesta que el sistema informático LimpiaGest, en la versión indicada, cumple con lo dispuesto en el artículo 29.2.j) de la Ley 58/2003, General Tributaria; con el Reglamento aprobado por el Real Decreto 1007/2023, de 5 de diciembre; con la Orden HAC/1177/2024, de 17 de octubre; y con las especificaciones publicadas en la sede electrónica de la Agencia Estatal de Administración Tributaria que completen dicha orden."
)

doc.add_heading("3. Fecha, lugar y firma", level=1)
add_kv_table(doc, [
    ("l) Lugar", "Roquetas de Mar, España"),
    ("l) Fecha", "____ de ______________ de 20____"),
    ("Firmante", "Representante autorizado de LIMPIEZAS RAIBA SOCIEDAD LIMITADA"),
    ("Firma", "____________________________________________"),
])

doc.add_page_break()
doc.add_heading("ANEXO I. Descripción técnica del cumplimiento", level=1)
add_kv_table(doc, [
    ("Integridad e inalterabilidad", "La emisión se ejecuta en servidor, asigna número correlativo mediante transacción, genera registro fiscal inmutable y huella SHA-256. Las facturas emitidas no se editan; las correcciones se realizan mediante los tipos fiscales previstos."),
    ("Trazabilidad", "Cada registro enlaza con el anterior y conserva identificadores de factura, empresa, versión, fecha/hora con huso, huella previa y huella resultante."),
    ("Remisión VERI*FACTU", "El registro se transforma en SOAP 1.1 oficial, se valida localmente contra los XSD de la AEAT y se remite por TLS mutuo al endpoint autorizado. El conector bloquea destinos distintos del entorno configurado."),
    ("Certificado", "El flujo local usa el certificado instalado en Windows sin exportar la clave privada. El token del conector se cifra mediante DPAPI. La alternativa cloud custodia PFX/P12 en Secret Manager."),
    ("Cola y reintentos", "Reclamación exclusiva con lease temporal, idempotencia, límite de intentos, espera exponencial y estados de aceptación, aceptación con errores, rechazo y reintento. El primer envío se bloquea si la hora fiscal lleva preparada más de tres minutos, para respetar el margen temporal de la AEAT."),
    ("Registro operativo", "Los eventos técnicos y fiscales relevantes se registran por empresa; las reglas impiden su modificación desde clientes no autorizados."),
    ("QR y leyenda", "La factura VeriFactu incorpora la URL oficial correspondiente al entorno, QR de 30 mm con corrección M, la etiqueta 'QR tributario:' y la leyenda VERI*FACTU. El caso TEST-VF-2026-0001 fue encontrado correctamente en el portal de cotejo de pruebas."),
    ("Uso multiempresa", "Los datos se segregan por companyId/tenant. Cada obligado dispone de configuración, numeración, cadena fiscal, cola, certificado y registro operativo independientes."),
])

annex_evidence_heading = doc.add_heading(
    "ANEXO II. Evidencias de cierre",
    level=1,
)
annex_evidence_heading.paragraph_format.page_break_before = True
annex_evidence_heading.paragraph_format.keep_together = True
annex_evidence_heading.paragraph_format.keep_with_next = True
table = doc.add_table(rows=1, cols=3)
table.style = "Table Grid"
table.alignment = WD_TABLE_ALIGNMENT.LEFT
headers = ("Control", "Estado", "Evidencia / acción pendiente")
for i, value in enumerate(headers):
    table.cell(0, i).text = value
    shade(table.cell(0, i), LIGHT)
    for run in table.cell(0, i).paragraphs[0].runs:
        set_font(run, bold=True, color=DARK)
rows = [
    ("Pruebas internas", "SUPERADO", "30 pruebas del servidor y 7 pruebas web focalizadas, compilación de producción, sintaxis PowerShell y validación XSD."),
    ("Certificado", "SUPERADO", "B04843843 detectado; clave privada no exportada; acceso WSDL de pruebas correcto; caducidad 20/11/2026."),
    ("Alta AEAT de pruebas", "SUPERADO", "TEST-VF-2026-0002, 1,21 EUR: aceptada sin errores al primer intento. También se conserva el alta aceptada de TEST-VF-2026-0001."),
    ("Anulación", "SUPERADO", "TEST-VF-2026-0002: aceptada sin errores al primer intento. Totales facturado y pendiente: 0,00 EUR. Se conserva el historial; no se borraron registros ni se marcaron como cobrados."),
    ("Subsanación", "SUPERADO", "TEST-VF-2026-0002: aceptada sin errores al primer intento. Nombre corregido a CLIENTE PRUEBA SUBSANACION CORREGIDO; NIF e importes sin cambios. Corrección técnica de59240 validada."),
    ("QR", "SUPERADO", "El portal AEAT de preproducción mostró 'Encontrada' y coincidieron NIF B04843843, número TEST-VF-2026-0001, fecha 31/07/2026 e importe 1,21 EUR."),
    ("Revisión independiente", "PENDIENTE", "Revisión jurídica/fiscal y técnica de la versión candidata."),
    ("Modo comercial exclusivo", "PENDIENTE", "Bloquear emisión cuando VERI*FACTU no esté activo para la versión declarada."),
    ("Firma declaración", "PENDIENTE", "Completar fecha, firmante y firma tras cerrar todos los controles."),
    ("Instalador firmado", "PENDIENTE", "Adquirir certificado de firma de código, firmar y verificar reputación/SmartScreen."),
]
for values in rows:
    cells = table.add_row().cells
    for i, value in enumerate(values):
        cells[i].text = value
        for run in cells[i].paragraphs[0].runs:
            pending_state = value in {"PENDIENTE", "REPETIR", "ACEPTADA CON AVISO"}
            set_font(run, size=9.5, bold=(i == 1), color=(RED if pending_state else "000000"))
set_table_geometry(table, [2350, 1550, 5460])

doc.add_heading("ANEXO III. Fuentes normativas", level=1)
sources = [
    "Real Decreto 1007/2023, de 5 de diciembre, artículo 13 (texto consolidado del BOE).",
    "Orden HAC/1177/2024, de 17 de octubre, artículo 15 y anexo (texto consolidado del BOE).",
    "Sede electrónica de la AEAT: Certificación de los sistemas informáticos y preguntas frecuentes VERI*FACTU, actualizadas a 21 de julio de 2026.",
]
for source in sources:
    p = doc.add_paragraph(style="List Bullet")
    p.paragraph_format.left_indent = Inches(0.5)
    p.paragraph_format.first_line_indent = Inches(-0.25)
    p.paragraph_format.space_after = Pt(8)
    p.paragraph_format.line_spacing = 1.167
    p.add_run(source)

doc.core_properties.title = "Declaración responsable del sistema informático de facturación LimpiaGest"
doc.core_properties.subject = "Borrador de cumplimiento VERI*FACTU"
doc.core_properties.author = "LIMPIEZAS RAIBA SOCIEDAD LIMITADA"
doc.save(OUT)
print(OUT)
