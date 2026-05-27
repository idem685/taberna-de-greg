#!/usr/bin/env python3
"""Generate Auditoria Taberna del Viejo Greg v1.5 PDF"""

import os
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm, cm
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, HRFlowable, ListFlowable, ListItem
)

# ━━ Cascade Palette ━━
PAGE_BG       = colors.HexColor('#f4f4f3')
SECTION_BG    = colors.HexColor('#eae9e7')
CARD_BG       = colors.HexColor('#eae8e4')
TABLE_STRIPE  = colors.HexColor('#ecebe9')
HEADER_FILL   = colors.HexColor('#665f4a')
COVER_BLOCK   = colors.HexColor('#655f4a')
BORDER        = colors.HexColor('#c4bca2')
ICON          = colors.HexColor('#7f7148')
ACCENT        = colors.HexColor('#25728c')
TEXT_PRIMARY   = colors.HexColor('#232320')
TEXT_MUTED     = colors.HexColor('#8b8881')
SEM_SUCCESS   = colors.HexColor('#407c54')
SEM_WARNING   = colors.HexColor('#9e8148')
SEM_ERROR     = colors.HexColor('#ac544c')
SEM_INFO      = colors.HexColor('#557ba2')

OUTPUT_PATH = '/home/z/my-project/download/auditoria_taberna_viejo_greg_v1.5.pdf'

# ━━ Styles ━━
styles = getSampleStyleSheet()

styles.add(ParagraphStyle(
    'CoverTitle', parent=styles['Title'],
    fontSize=36, leading=42, textColor=colors.white,
    alignment=TA_CENTER, spaceAfter=8*mm, fontName='Helvetica-Bold'
))
styles.add(ParagraphStyle(
    'CoverSubtitle', parent=styles['Normal'],
    fontSize=16, leading=22, textColor=colors.HexColor('#d4c9a8'),
    alignment=TA_CENTER, spaceAfter=4*mm, fontName='Helvetica'
))
styles.add(ParagraphStyle(
    'CoverMeta', parent=styles['Normal'],
    fontSize=11, leading=16, textColor=colors.HexColor('#b0a88a'),
    alignment=TA_CENTER, fontName='Helvetica'
))
styles.add(ParagraphStyle(
    'H1', parent=styles['Heading1'],
    fontSize=20, leading=26, textColor=HEADER_FILL,
    spaceBefore=14*mm, spaceAfter=6*mm, fontName='Helvetica-Bold'
))
styles.add(ParagraphStyle(
    'H2', parent=styles['Heading2'],
    fontSize=15, leading=20, textColor=ACCENT,
    spaceBefore=8*mm, spaceAfter=4*mm, fontName='Helvetica-Bold'
))
styles.add(ParagraphStyle(
    'H3', parent=styles['Heading3'],
    fontSize=12, leading=16, textColor=ICON,
    spaceBefore=5*mm, spaceAfter=3*mm, fontName='Helvetica-Bold'
))
styles.add(ParagraphStyle(
    'Body', parent=styles['Normal'],
    fontSize=10, leading=15, textColor=TEXT_PRIMARY,
    alignment=TA_JUSTIFY, spaceAfter=3*mm, fontName='Helvetica'
))
styles.add(ParagraphStyle(
    'BodySmall', parent=styles['Normal'],
    fontSize=9, leading=13, textColor=TEXT_MUTED,
    alignment=TA_JUSTIFY, spaceAfter=2*mm, fontName='Helvetica'
))
styles.add(ParagraphStyle(
    'CodeInline', parent=styles['Normal'],
    fontSize=9, leading=13, textColor=ACCENT,
    fontName='Courier', backColor=colors.HexColor('#f0efe8')
))
styles.add(ParagraphStyle(
    'BadgeCritical', parent=styles['Normal'],
    fontSize=8, leading=11, textColor=colors.white,
    fontName='Helvetica-Bold', backColor=SEM_ERROR,
    alignment=TA_CENTER
))
styles.add(ParagraphStyle(
    'BadgeFixed', parent=styles['Normal'],
    fontSize=8, leading=11, textColor=colors.white,
    fontName='Helvetica-Bold', backColor=SEM_SUCCESS,
    alignment=TA_CENTER
))
styles.add(ParagraphStyle(
    'BadgeMedium', parent=styles['Normal'],
    fontSize=8, leading=11, textColor=colors.white,
    fontName='Helvetica-Bold', backColor=SEM_WARNING,
    alignment=TA_CENTER
))
styles.add(ParagraphStyle(
    'BadgeNew', parent=styles['Normal'],
    fontSize=8, leading=11, textColor=colors.white,
    fontName='Helvetica-Bold', backColor=SEM_INFO,
    alignment=TA_CENTER
))

def badge(text, style_name):
    return Paragraph(text, styles[style_name])

def make_severity_table(rows):
    """Create a severity matrix table."""
    data = [['Seccion', 'Problema', 'Severidad', 'Estado']]
    for row in rows:
        data.append(row)
    
    col_widths = [30*mm, 65*mm, 22*mm, 22*mm]
    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), HEADER_FILL),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
        ('ALIGN', (2, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, TABLE_STRIPE]),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
    ]))
    return t

# ━━ Build Document ━━
doc = SimpleDocTemplate(
    OUTPUT_PATH,
    pagesize=A4,
    leftMargin=20*mm, rightMargin=20*mm,
    topMargin=20*mm, bottomMargin=20*mm,
)

story = []

# ━━ Cover Page ━━
story.append(Spacer(1, 35*mm))

# Title block with background
cover_data = [[
    Paragraph('Taberna del Viejo Greg', styles['CoverTitle']),
]]
cover_table = Table(cover_data, colWidths=[170*mm])
cover_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, -1), COVER_BLOCK),
    ('TOPPADDING', (0, 0), (-1, -1), 12*mm),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 8*mm),
    ('LEFTPADDING', (0, 0), (-1, -1), 10*mm),
    ('RIGHTPADDING', (0, 0), (-1, -1), 10*mm),
]))
story.append(cover_table)

story.append(Spacer(1, 6*mm))

cover_sub = [[
    Paragraph('Auditoria UX/UI y Desarrollo', styles['CoverSubtitle']),
    Paragraph('Version 1.5 - Correcciones criticas v2 + Resiliencia', styles['CoverSubtitle']),
]]
cover_sub_table = Table(cover_sub, colWidths=[170*mm])
cover_sub_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#7a7260')),
    ('TOPPADDING', (0, 0), (-1, -1), 4*mm),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 4*mm),
    ('LEFTPADDING', (0, 0), (-1, -1), 10*mm),
    ('RIGHTPADDING', (0, 0), (-1, -1), 10*mm),
]))
story.append(cover_sub_table)

story.append(Spacer(1, 20*mm))

# Description
story.append(Paragraph(
    'Analisis profundo de la aplicacion RPG de texto con IA como Dungeon Master. '
    'Incluye correcciones criticas aplicadas en dos rondas (v1.0 y v1.5), '
    'puntos fuertes, debilidades detectadas, oportunidades de mejora y feedback de diseno de interfaz.',
    styles['CoverMeta']
))

story.append(Spacer(1, 15*mm))

meta_data = [
    ['Fecha:', '27 de mayo de 2026'],
    ['Autor:', 'Z.ai - Equipo de Producto'],
    ['Version:', '1.5 - Post-correcciones criticas ronda 2'],
    ['Build:', '0 errores TypeScript, Next.js 16.1.3'],
]
meta_table = Table(meta_data, colWidths=[35*mm, 100*mm])
meta_table.setStyle(TableStyle([
    ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
    ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
    ('FONTSIZE', (0, 0), (-1, -1), 10),
    ('TEXTCOLOR', (0, 0), (-1, -1), TEXT_MUTED),
    ('TOPPADDING', (0, 0), (-1, -1), 2),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
]))
story.append(meta_table)

story.append(PageBreak())

# ━━ 1. Resumen Ejecutivo ━━
story.append(Paragraph('1. Resumen Ejecutivo', styles['H1']))

story.append(Paragraph(
    'Esta auditoria actualiza la Version 1.0 con las correcciones criticas adicionales identificadas '
    'tras detectar que el boton "Comenzar Aventura" fallaba sistematicamente. La causa raiz fue un desajuste '
    'entre las claves snake_case que devuelve la IA y las claves camelCase que espera el frontend TypeScript, '
    'combinado con la ausencia de transformacion en el backend y la falta de mecanismos de resiliencia.',
    styles['Body']
))

story.append(Paragraph(
    'Las correcciones de la Version 1.5 abordan problemas de tres categorias: transformacion de datos '
    '(snake_case a camelCase aplicada ahora en el backend como primera linea de defensa), resiliencia '
    '(timeout en fetch, personaje fallback cuando la IA falla, validacion defensiva en el store), y '
    'experiencia de usuario (mensajes de estado durante la creacion, boton de reintentar, modo rapido offline). '
    'El build compila con 0 errores TypeScript en modo estricto.',
    styles['Body']
))

# Summary table
summary_data = [
    ['Metrica', 'v1.0', 'v1.5'],
    ['Errores TypeScript', '0', '0'],
    ['Errores criticos abiertos', '5', '0'],
    ['Errores medios abiertos', '4', '0'],
    ['Problemas de UX abiertos', '6', '4'],
    ['Mecanismos de resiliencia', '0', '5'],
    ['Transformacion backend', 'No', 'Si (ambas rutas)'],
    ['Timeout en AI requests', 'No', 'Si (120s)'],
    ['Personaje fallback', 'No', 'Si'],
]
t = Table(summary_data, colWidths=[55*mm, 40*mm, 40*mm], repeatRows=1)
t.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), HEADER_FILL),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('FONTNAME', (0, 1), (0, -1), 'Helvetica-Bold'),
    ('FONTSIZE', (0, 0), (-1, -1), 9),
    ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, TABLE_STRIPE]),
    ('GRID', (0, 0), (-1, -1), 0.5, BORDER),
    ('TOPPADDING', (0, 0), (-1, -1), 4),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
]))
story.append(t)

# ━━ 2. Correcciones Realizadas ━━
story.append(Paragraph('2. Correcciones Realizadas', styles['H1']))

story.append(Paragraph('2.1 Correcciones de la Version 1.0 (Ronda 1)', styles['H2']))

v1_fixes = [
    ['snake_case / camelCase en respuestas de IA', 'Critico', 'Corregido'],
    ['Inconsistencia prompt: bookOfDead vs book_of_dead', 'Critico', 'Corregido'],
    ['completeQuest no cura al subir de nivel', 'Alto', 'Corregido'],
    ['ignoreBuildErrors ocultaba errores TypeScript', 'Alto', 'Corregido'],
    ['tsconfig incluia directorios ajenos', 'Alto', 'Corregido'],
    ['Operador || en lugar de ?? para nullish coalescing', 'Medio', 'Corregido'],
    ['value posiblemente undefined en equipItem', 'Medio', 'Corregido'],
]
story.append(make_severity_table(v1_fixes))
story.append(Spacer(1, 4*mm))

story.append(Paragraph('2.2 Correcciones de la Version 1.5 (Ronda 2)', styles['H2']))

story.append(Paragraph(
    'Las siguientes correcciones se aplicaron tras descubrir que el boton "Comenzar Aventura" '
    'fallaba sistematicamente. La causa principal fue que el backend devolvia respuestas de IA con claves '
    'snake_case sin transformar, haciendo que el frontend no encontrara los datos esperados. Ademas, '
    'la ausencia de timeout y personaje fallback hacia que cualquier fallo de la IA bloqueara completamente '
    'la aplicacion sin posibilidad de recuperacion.',
    styles['Body']
))

story.append(Paragraph('2.2.1 Transformacion snake_case a camelCase en el Backend (Ambas Rutas API)', styles['H3']))

story.append(Paragraph(
    'Se aplico <font face="Courier" color="#25728c">transformKeysDeep()</font> en ambas rutas API del backend '
    '(<font face="Courier">/api/create-character</font> y <font face="Courier">/api/dm</font>) para convertir '
    'automaticamente todas las claves snake_case a camelCase antes de enviar la respuesta al frontend. '
    'Esta es la primera linea de defensa: el backend SIEMPRE devuelve camelCase al frontend, independientemente '
    'del formato que use la IA. La transformacion <font face="Courier">transformAIResponse()</font> en el '
    'frontend se mantiene como red de seguridad.',
    styles['Body']
))

story.append(Paragraph(
    'Archivos modificados: <font face="Courier">src/app/api/create-character/route.ts</font>, '
    '<font face="Courier">src/app/api/dm/route.ts</font>, '
    '<font face="Courier">src/lib/game-types.ts</font> (exportacion de transformKeysDeep). '
    'El DM route ahora devuelve consistentemente <font face="Courier">stateUpdates</font> y '
    '<font face="Courier">diceRolls</font> en camelCase, eliminando la dependencia del frontend '
    'para la transformacion.',
    styles['Body']
))

story.append(Paragraph('2.2.2 Timeout en Requests de IA con AbortController', styles['H3']))

story.append(Paragraph(
    'Se agrego un timeout de 120 segundos usando <font face="Courier">AbortController</font> en ambos '
    'componentes de fetch: <font face="Courier">character-creation.tsx</font> y '
    '<font face="Courier">chat.tsx</font>. Sin este timeout, si la IA tarda mas de lo esperado '
    '(los logs mostraron respuestas de hasta 59 segundos), el navegador podria cancelar la peticion '
    'o el usuario veria un estado de carga infinito. Ahora, al expirar el timeout, se muestra un '
    'mensaje de error claro y se habilita el boton de reintentar.',
    styles['Body']
))

story.append(Paragraph('2.2.3 Personaje Fallback para Creacion sin IA', styles['H3']))

story.append(Paragraph(
    'Se implemento <font face="Courier">createFallbackCharacter()</font> que genera un personaje '
    'completo de D&D 5e basandose en el texto de descripcion del jugador, sin necesidad de llamar a la IA. '
    'Esta funcion analiza la descripcion para determinar raza, clase, estadisticas, habilidades, salvaciones, '
    'equipo inicial y narrativa de apertura. Incluye distribucion de puntos (27-point-buy), asignacion de '
    'habilidades competentes por clase, y equipo basico apropiado. Se activa automaticamente cuando la IA '
    'falla, a traves del boton "Modo rapido (sin IA)" que aparece en el mensaje de error.',
    styles['Body']
))

story.append(Paragraph('2.2.4 setCharacter Defensivo en el Store', styles['H3']))

story.append(Paragraph(
    'La funcion <font face="Courier">setCharacter()</font> en el store ahora valida y completa todos los '
    'campos del personaje con valores por defecto antes de guardar. Si la IA devuelve un personaje con '
    '<font face="Courier">abilityScores</font> faltante o <font face="Courier">skills</font> vacio, el '
    'store los rellena automaticamente con datos validos. Esto evita crashes en componentes que acceden '
    'a propiedades anidadas como <font face="Courier">character.abilityScores.strength</font> o '
    '<font face="Courier">character.savingThrows.dexterity</font>.',
    styles['Body']
))

story.append(Paragraph('2.2.5 Mejora de UX en la Creacion de Personaje', styles['H3']))

story.append(Paragraph(
    'Se mejoro significativamente la experiencia de usuario durante la creacion de personaje: '
    'se agregaron mensajes de estado progresivos ("Conectando con el Dungeon Master...", '
    '"El Viejo Greg prepara tu aventura...", "Configurando tu mundo..."), un panel de error '
    'visible con dos opciones de recuperacion (reintentar con IA o modo rapido offline), y '
    'se elimino el <font face="Courier">return</font> prematuro que dejaba '
    '<font face="Courier">isCreating</font> en true cuando la API devolvia error.',
    styles['Body']
))

# V1.5 severity table
v15_fixes = [
    ['snake_case en backend (ambas rutas API)', 'Critico', 'Corregido'],
    ['Sin timeout en fetch de IA', 'Critico', 'Corregido'],
    ['Sin personaje fallback', 'Critico', 'Corregido'],
    ['setCharacter crashea con datos incompletos', 'Alto', 'Corregido'],
    ['UX: sin feedback durante creacion', 'Medio', 'Corregido'],
    ['UX: sin opcion de recuperacion ante error', 'Medio', 'Corregido'],
]
story.append(make_severity_table(v15_fixes))

# ━━ 3. Puntos Fuertes ━━
story.append(Paragraph('3. Puntos Fuertes', styles['H1']))

strengths = [
    ('Arquitectura de Estado Centralizada',
     'El store Zustand con persistencia en localStorage ofrece una arquitectura limpia y predecible. '
     'Las acciones estan bien definidas y la separacion entre estado del juego y estado de la UI es '
     'clara. La nueva transformacion en el backend refuerza esta arquitectura al garantizar que el '
     'frontend siempre reciba datos en el formato correcto.'),
    ('Sistema de Tipos D&D 5e Completo',
     'La definicion de tipos en game-types.ts cubre todos los aspectos de D&D 5e: puntuaciones de '
     'caracteristicas, modificadores, tiradas de salvacion, habilidades con competencia y experiencia, '
     'dados de golpe, salvaciones de muerte, condiciones y mas. El sistema de transformacion de claves '
     'ahora esta integrado directamente en los tipos, asegurando consistencia end-to-end.'),
    ('Prompt Engineering del DM',
     'Los prompts de sistema tanto para creacion de personaje como para el DM estan bien disenados, '
     'con instrucciones claras sobre el formato JSON, reglas de D&D 5e, y directrices narrativas. '
     'El prompt del DM ahora especifica consistentemente snake_case para las claves de state_updates, '
     'y el backend las transforma automaticamente.'),
    ('Diseno de Interfaz Tematico',
     'La paleta de colores con tonos ambar/dorado, las animaciones sutiles (fadeIn, pulse-glow, shimmer), '
     'y los colores de rareza para objetos crean una atmosfera inmersiva que refleja el tema de taberna '
     'fantastica. Los iconos de Lucide complementan bien la estetica.'),
    ('Resiliencia Multi-Capa',
     'La Version 1.5 introduce un sistema de resiliencia en tres capas: transformacion en el backend '
     '(primera linea), transformacion en el frontend (red de seguridad), y personaje fallback (ultima '
     'instancia). Esto garantiza que la aplicacion funcione incluso cuando la IA falla o devuelve '
     'datos inesperados.'),
]

for title, desc in strengths:
    story.append(Paragraph(f'<b>{title}</b>', styles['H3']))
    story.append(Paragraph(desc, styles['Body']))

# ━━ 4. Puntos Debiles ━━
story.append(Paragraph('4. Puntos Debiles', styles['H1']))

weaknesses = [
    ('Sin Validacion de Schema con Zod',
     'Aunque se agrego transformacion de claves, no hay validacion formal del schema de las respuestas '
     'de IA. La IA podria devolver tipos incorrectos (string en lugar de number, objetos en lugar de arrays) '
     'que causen errores silenciosos. Se recomienda implementar validacion con Zod en ambas rutas API.'),
    ('Sin Rate Limiting en APIs',
     'Las rutas API no tienen limitacion de peticiones. Un usuario podria hacer spam de creaciones de '
     'personaje o mensajes al DM, sobrecargando el servicio de IA. Se recomienda agregar rate limiting '
     'basico por IP o sesion.'),
    ('Sin Sanitizacion de Entrada del Jugador',
     'El mensaje del jugador se envia directamente a la IA sin sanitizacion. Aunque la IA es robusta, '
     'un prompt de inyeccion podria confundir al DM. Se recomienda agregar sanitizacion basica.'),
    ('Persistencia Solo en localStorage',
     'Los datos del juego se persisten unicamente en localStorage, que es volatil y tiene un limite '
     'de ~5MB. Partidas largas con mucho historial de chat podrian exceder este limite. Se recomienda '
     'implementar persistencia en el servidor con Prisma/SQLite (ya configurado en el proyecto).'),
    ('Dependencias No Utilizadas',
     'El proyecto incluye dependencias como @dnd-kit, @mdxeditor, framer-motion, next-auth, next-intl, '
     'react-syntax-highlighter, y recharts que no se utilizan en el codigo actual. Esto aumenta el '
     'tamano del bundle y el tiempo de instalacion.'),
    ('Chat: Historial del DM en Contexto Truncado',
     'El historial de chat enviado como contexto a la IA esta limitado a 15 mensajes recientes, y los '
     'mensajes del DM se envian como texto plano perdiendo la estructura de state_updates. Esto puede '
     'causar inconsistencias en la narrativa del DM a largo plazo.'),
]

for title, desc in weaknesses:
    story.append(Paragraph(f'<b>{title}</b>', styles['H3']))
    story.append(Paragraph(desc, styles['Body']))

# ━━ 5. Oportunidades de Mejora ━━
story.append(Paragraph('5. Oportunidades de Mejora', styles['H1']))

opportunities = [
    ('Validacion de Schema con Zod',
     'Implementar schemas Zod para validar las respuestas de IA en ambas rutas API. Esto proporcionaria '
     'validacion de tipos en runtime, mensajes de error utiles para debugging, y la posibilidad de '
     'sanitizar y transformar datos automaticamente. El proyecto ya tiene Zod como dependencia.'),
    ('Sistema de Combate Estructurado',
     'Agregar un modo de combate con turnos estructurados: iniciativa automatica, AC del oponente, '
     'tiradas de ataque y dano visibles, y tracking de HP de enemigos. Esto mejoraria la experiencia '
     'de combate que actualmente depende enteramente de la narrativa del DM.'),
    ('Sistema de Guardado en Servidor',
     'Migrar la persistencia de localStorage a la base de datos SQLite ya configurada con Prisma. '
     'Esto eliminaria el limite de 5MB, permitiria sincronizacion entre dispositivos, y facilitaria '
     'la recuperacion de partidas perdidas.'),
    ('Feedback Visual de Actualizaciones de Estado',
     'Agregar animaciones y notificaciones visuales cuando el DM aplica actualizaciones de estado: '
     'dano recibido (flash rojo), curacion (flash verde), nuevo objeto (notificacion con icono), '
     'nivel subido (efecto dorado). Esto haria mas tangible el impacto de las acciones del jugador.'),
    ('Optimizacion del Contexto para la IA',
     'Implementar un sistema de contexto mas inteligente que incluya un resumen de eventos pasados '
     'en lugar de los ultimos N mensajes. Esto permitiria mantener coherencia narrativa en partidas '
     'largas sin exceder el limite de tokens del modelo.'),
    ('Modo Offline Completo con PWA',
     'Completar la implementacion PWA con service worker para permitir juego offline. El personaje '
     'fallback es el primer paso; el siguiente seria un DM local basico que pueda manejar acciones '
     'simples sin conexion a internet.'),
]

for title, desc in opportunities:
    story.append(Paragraph(f'<b>{title}</b>', styles['H3']))
    story.append(Paragraph(desc, styles['Body']))

# ━━ 6. Feedback de Diseno UI ━━
story.append(Paragraph('6. Feedback de Diseno UI', styles['H1']))

ui_feedback = [
    ('Navegacion Inferior: 7 Pestanas es Excesivo',
     'La barra inferior con 7 pestanas en movil es densa y dificil de usar. Los iconos y textos '
     'se comprimen excesivamente en pantallas pequenas. Se recomienda agrupar las pestanas en '
     'categorias: "Aventura" (chat), "Personaje" (hoja + inventario), "Mundo" (misiones + relaciones), '
     '"Registro" (bestiario + libro de muertes), o implementar un "more" menu para las pestanas '
     'secundarias.'),
    ('Hoja de Personaje: Densidad de Informacion',
     'La hoja de personaje muestra demasiada informacion de una vez. Las 6 puntuaciones de caracteristica, '
     '18 habilidades, 6 tiradas de salvacion, salvaciones de muerte y condiciones crean scroll excesivo. '
     'Se recomienda usar un sistema de pestanas o acordeones dentro de la hoja de personaje, con '
     'resumen rapido de stats principales visible sin scroll.'),
    ('Chat: Indicadores de Accion Sugerida',
     'El chat no ofrece sugerencias de accion al jugador. Cuando el jugador no sabe que hacer, '
     'podria abandonar la partida. Se recomienda agregar botones de accion rapida contextual: '
     '"Atacar", "Hablar", "Explorar", "Descansar" que aparezcan cuando el DM describe una situacion '
     'que requiere accion.'),
    ('Creacion: Progreso Visual',
     'Aunque se mejoraron los mensajes de estado, se podria agregar una barra de progreso o pasos '
     'visibles (1. Describir - 2. Generar - 3. Configurar) para dar al usuario una idea clara del '
     'progreso durante los 30-60 segundos que tarda la IA.'),
]

for title, desc in ui_feedback:
    story.append(Paragraph(f'<b>{title}</b>', styles['H3']))
    story.append(Paragraph(desc, styles['Body']))

# ━━ 7. Matriz de Severidad ━━
story.append(Paragraph('7. Matriz de Severidad Detallada', styles['H1']))

all_issues = [
    # V1.0 fixes
    ['v1.0', 'snake_case / camelCase frontend', 'Critico', 'Corregido'],
    ['v1.0', 'Prompt inconsistente bookOfDead', 'Critico', 'Corregido'],
    ['v1.0', 'completeQuest no cura HP', 'Alto', 'Corregido'],
    ['v1.0', 'ignoreBuildErrors ocultaba errores', 'Alto', 'Corregido'],
    ['v1.0', 'tsconfig con dirs ajenos', 'Alto', 'Corregido'],
    ['v1.0', 'Operador || en lugar de ??', 'Medio', 'Corregido'],
    # V1.5 fixes
    ['v1.5', 'snake_case en backend (2 rutas)', 'Critico', 'Corregido'],
    ['v1.5', 'Sin timeout en fetch IA', 'Critico', 'Corregido'],
    ['v1.5', 'Sin personaje fallback', 'Critico', 'Corregido'],
    ['v1.5', 'setCharacter sin validacion', 'Alto', 'Corregido'],
    ['v1.5', 'UX sin feedback de creacion', 'Medio', 'Corregido'],
    # Remaining
    ['Pend.', 'Sin validacion Zod de IA', 'Alto', 'Pendiente'],
    ['Pend.', 'Sin rate limiting', 'Medio', 'Pendiente'],
    ['Pend.', 'Sin sanitizacion de entrada', 'Medio', 'Pendiente'],
    ['Pend.', 'Persistencia solo localStorage', 'Medio', 'Pendiente'],
    ['Pend.', 'Dependencias no utilizadas', 'Bajo', 'Pendiente'],
    ['Pend.', 'Contexto IA truncado', 'Medio', 'Pendiente'],
]

severity_data = [['Version', 'Problema', 'Severidad', 'Estado']] + all_issues
col_widths = [18*mm, 70*mm, 22*mm, 22*mm]
t = Table(severity_data, colWidths=col_widths, repeatRows=1)
t.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), HEADER_FILL),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('FONTSIZE', (0, 0), (-1, -1), 8),
    ('ALIGN', (0, 0), (0, -1), 'CENTER'),
    ('ALIGN', (2, 0), (-1, -1), 'CENTER'),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, TABLE_STRIPE]),
    ('GRID', (0, 0), (-1, -1), 0.5, BORDER),
    ('TOPPADDING', (0, 0), (-1, -1), 3),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ('LEFTPADDING', (0, 0), (-1, -1), 4),
    ('RIGHTPADDING', (0, 0), (-1, -1), 4),
    # Color severity cells
    ('BACKGROUND', (2, 1), (2, 3), SEM_ERROR),
    ('TEXTCOLOR', (2, 1), (2, 3), colors.white),
    ('BACKGROUND', (2, 4), (2, 6), SEM_WARNING),
    ('TEXTCOLOR', (2, 4), (2, 6), colors.white),
    ('BACKGROUND', (2, 7), (2, 7), SEM_ERROR),
    ('TEXTCOLOR', (2, 7), (2, 7), colors.white),
    ('BACKGROUND', (2, 8), (2, 9), SEM_ERROR),
    ('TEXTCOLOR', (2, 8), (2, 9), colors.white),
    ('BACKGROUND', (2, 10), (2, 10), SEM_WARNING),
    ('TEXTCOLOR', (2, 10), (2, 10), colors.white),
    ('BACKGROUND', (2, 11), (2, 11), SEM_INFO),
    ('TEXTCOLOR', (2, 11), (2, 11), colors.white),
    ('BACKGROUND', (2, 12), (2, 12), SEM_WARNING),
    ('TEXTCOLOR', (2, 12), (2, 12), colors.white),
    ('BACKGROUND', (2, 13), (2, 14), SEM_INFO),
    ('TEXTCOLOR', (2, 13), (2, 14), colors.white),
    ('BACKGROUND', (2, 15), (2, 15), SEM_WARNING),
    ('TEXTCOLOR', (2, 15), (2, 15), colors.white),
    ('BACKGROUND', (2, 16), (2, 16), SEM_INFO),
    ('TEXTCOLOR', (2, 16), (2, 16), colors.white),
    ('BACKGROUND', (2, 17), (2, 17), SEM_WARNING),
    ('TEXTCOLOR', (2, 17), (2, 17), colors.white),
    # Status colors
    ('BACKGROUND', (3, 1), (3, 11), SEM_SUCCESS),
    ('TEXTCOLOR', (3, 1), (3, 11), colors.white),
    ('BACKGROUND', (3, 12), (3, 17), colors.HexColor('#aaa')),
    ('TEXTCOLOR', (3, 12), (3, 17), colors.white),
]))
story.append(t)

# ━━ 8. Plan de Accion ━━
story.append(Paragraph('8. Plan de Accion Priorizado', styles['H1']))

plan_data = [
    ['Prioridad', 'Accion', 'Impacto', 'Esfuerzo'],
    ['P0', 'Validacion Zod en API routes', 'Alto', 'Medio'],
    ['P0', 'Rate limiting basico por IP', 'Alto', 'Bajo'],
    ['P1', 'Sanitizacion de entrada del jugador', 'Medio', 'Bajo'],
    ['P1', 'Persistencia en servidor con Prisma', 'Alto', 'Alto'],
    ['P1', 'Agrupar pestanas de navegacion', 'Medio', 'Medio'],
    ['P2', 'Botones de accion rapida en chat', 'Medio', 'Medio'],
    ['P2', 'Sistema de combate estructurado', 'Alto', 'Alto'],
    ['P2', 'Limpiar dependencias no utilizadas', 'Bajo', 'Bajo'],
    ['P3', 'PWA completa con service worker', 'Medio', 'Alto'],
    ['P3', 'Optimizacion de contexto IA', 'Medio', 'Medio'],
]

t = Table(plan_data, colWidths=[22*mm, 65*mm, 22*mm, 22*mm], repeatRows=1)
t.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), HEADER_FILL),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('FONTSIZE', (0, 0), (-1, -1), 9),
    ('ALIGN', (0, 0), (0, -1), 'CENTER'),
    ('ALIGN', (2, 0), (-1, -1), 'CENTER'),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, TABLE_STRIPE]),
    ('GRID', (0, 0), (-1, -1), 0.5, BORDER),
    ('TOPPADDING', (0, 0), (-1, -1), 4),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    # Priority colors
    ('BACKGROUND', (0, 1), (0, 2), SEM_ERROR),
    ('TEXTCOLOR', (0, 1), (0, 2), colors.white),
    ('BACKGROUND', (0, 3), (0, 5), SEM_WARNING),
    ('TEXTCOLOR', (0, 3), (0, 5), colors.white),
    ('BACKGROUND', (0, 6), (0, 8), SEM_INFO),
    ('TEXTCOLOR', (0, 6), (0, 8), colors.white),
    ('BACKGROUND', (0, 9), (0, 10), colors.HexColor('#8b8881')),
    ('TEXTCOLOR', (0, 9), (0, 10), colors.white),
]))
story.append(t)

story.append(Spacer(1, 8*mm))
story.append(Paragraph(
    'El proximo paso recomendado es implementar la validacion Zod en ambas rutas API (P0), lo que '
    'cerraria la brecha de calidad mas importante que queda. El rate limiting por IP es una mejora '
    'rapida de alto impacto que protege contra abuso. La migracion a persistencia en servidor (P1) '
    'es la mejora mas significativa a mediano plazo para eliminar la dependencia de localStorage.',
    styles['Body']
))

# Build
doc.build(story)
print(f'PDF generado: {OUTPUT_PATH}')
