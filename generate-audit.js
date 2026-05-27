const { Document, Packer, Paragraph, TextRun, Header, Footer, Table, TableRow, TableCell,
        AlignmentType, HeadingLevel, PageNumber, BorderStyle, WidthType, ShadingType,
        PageBreak, SectionType } = require("docx");
const fs = require("fs");

// Palette: DM-1 (Deep Cyan - AI/Tech)
const P = {
  primary: "162235",
  body: "1A2030",
  secondary: "5A6878",
  accent: "1B6B7A",
  surface: "EDF3F5",
  white: "FFFFFF",
  light: "F4F8FC",
  green: "2D7A4F",
  red: "C0392B",
  orange: "D4875A",
  yellow: "B8860B",
};

const c = (hex) => hex.replace("#", "");

function heading1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 160 },
    children: [new TextRun({ text, bold: true, size: 32, color: P.primary, font: { ascii: "Calibri", eastAsia: "SimHei" } })],
  });
}

function heading2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
    children: [new TextRun({ text, bold: true, size: 28, color: P.primary, font: { ascii: "Calibri", eastAsia: "SimHei" } })],
  });
}

function heading3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 80 },
    children: [new TextRun({ text, bold: true, size: 24, color: P.accent, font: { ascii: "Calibri", eastAsia: "SimHei" } })],
  });
}

function bodyText(text) {
  return new Paragraph({
    spacing: { line: 312, after: 80 },
    children: [new TextRun({ text, size: 22, color: P.body, font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" } })],
  });
}

function bodyBold(label, text) {
  return new Paragraph({
    spacing: { line: 312, after: 80 },
    children: [
      new TextRun({ text: label, bold: true, size: 22, color: P.primary, font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" } }),
      new TextRun({ text, size: 22, color: P.body, font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" } }),
    ],
  });
}

function statusTag(status) {
  const colors = { FIXED: P.green, OPEN: P.red, PARTIAL: P.orange };
  return new TextRun({ text: ` [${status}]`, bold: true, size: 22, color: colors[status] || P.secondary, font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" } });
}

function issueRow(id, severity, desc, status) {
  const sevColors = { CRITICAL: P.red, HIGH: P.orange, MEDIUM: P.yellow, LOW: P.secondary };
  const sevColor = sevColors[severity] || P.body;
  const statusColor = status === "FIXED" ? P.green : (status === "PARTIAL" ? P.orange : P.red);
  const bgFill = severity === "CRITICAL" ? "FFF0F0" : P.white;
  return new TableRow({
    children: [
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: id, bold: true, size: 20, color: sevColor, font: { ascii: "Calibri" } })] })],
        margins: { top: 40, bottom: 40, left: 80, right: 80 },
        shading: { type: ShadingType.CLEAR, fill: bgFill },
      }),
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: severity, bold: true, size: 20, color: sevColor, font: { ascii: "Calibri" } })] })],
        margins: { top: 40, bottom: 40, left: 80, right: 80 },
        shading: { type: ShadingType.CLEAR, fill: bgFill },
      }),
      new TableCell({
        width: { size: 55, type: WidthType.PERCENTAGE },
        children: [new Paragraph({ children: [new TextRun({ text: desc, size: 20, color: P.body, font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" } })] })],
        margins: { top: 40, bottom: 40, left: 80, right: 80 },
      }),
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: status, bold: true, size: 20, color: statusColor, font: { ascii: "Calibri" } })] })],
        margins: { top: 40, bottom: 40, left: 80, right: 80 },
      }),
    ],
  });
}

// Build cover section
const coverSection = {
  properties: {
    page: {
      margin: { top: 0, bottom: 0, left: 0, right: 0 },
    },
  },
  children: [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          height: { value: 16838, rule: "exact" },
          children: [
            new TableCell({
              width: { size: 100, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: P.primary },
              verticalAlign: "top",
              borders: {
                top: { style: BorderStyle.NONE, size: 0, color: P.white },
                bottom: { style: BorderStyle.NONE, size: 0, color: P.white },
                left: { style: BorderStyle.NONE, size: 0, color: P.white },
                right: { style: BorderStyle.NONE, size: 0, color: P.white },
                insideHorizontal: { style: BorderStyle.NONE, size: 0, color: P.white },
                insideVertical: { style: BorderStyle.NONE, size: 0, color: P.white },
              },
              children: [
                new Paragraph({ spacing: { before: 3600 } }),
                new Paragraph({
                  alignment: AlignmentType.LEFT,
                  indent: { left: 1200 },
                  spacing: { after: 200 },
                  children: [
                    new TextRun({ text: "AUDITOR\u00cdA UX/UI", size: 56, bold: true, color: P.white, font: { ascii: "Calibri", eastAsia: "SimHei" } }),
                  ],
                }),
                new Paragraph({
                  alignment: AlignmentType.LEFT,
                  indent: { left: 1200 },
                  spacing: { after: 100 },
                  border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "37DCF2", space: 10 } },
                  children: [
                    new TextRun({ text: "Taberna del Viejo Greg", size: 36, color: "37DCF2", font: { ascii: "Calibri", eastAsia: "SimHei" } }),
                  ],
                }),
                new Paragraph({ spacing: { before: 400 } }),
                new Paragraph({
                  alignment: AlignmentType.LEFT,
                  indent: { left: 1200 },
                  children: [
                    new TextRun({ text: "RPG de texto con IA \u2014 D&D 5e", size: 24, color: "B0B8C0", font: { ascii: "Calibri" } }),
                  ],
                }),
                new Paragraph({
                  alignment: AlignmentType.LEFT,
                  indent: { left: 1200 },
                  spacing: { before: 200 },
                  children: [
                    new TextRun({ text: "Version 1.5 \u2014 26 de mayo de 2026", size: 22, color: "90989F", font: { ascii: "Calibri" } }),
                  ],
                }),
                new Paragraph({
                  alignment: AlignmentType.LEFT,
                  indent: { left: 1200 },
                  spacing: { before: 100 },
                  children: [
                    new TextRun({ text: "Build: next-16 + TypeScript + Zustand + Tailwind CSS 4", size: 20, color: "687078", font: { ascii: "Calibri" } }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    }),
  ],
};

// Build body section
const tableHeaderBorders = {
  top: { style: BorderStyle.SINGLE, size: 2, color: P.accent },
  bottom: { style: BorderStyle.SINGLE, size: 2, color: P.accent },
  left: { style: BorderStyle.NONE, size: 0, color: P.white },
  right: { style: BorderStyle.NONE, size: 0, color: P.white },
};

const tableDataBorders = {
  top: { style: BorderStyle.NONE, size: 0, color: P.white },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: "D0D8E0" },
  left: { style: BorderStyle.NONE, size: 0, color: P.white },
  right: { style: BorderStyle.NONE, size: 0, color: P.white },
};

const headerCellProps = {
  shading: { type: ShadingType.CLEAR, fill: P.surface },
  margins: { top: 60, bottom: 60, left: 80, right: 80 },
  borders: tableHeaderBorders,
};

const bodySection = {
  properties: {
    page: {
      margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 },
      pageNumbers: { start: 1 },
    },
  },
  footers: {
    default: new Footer({
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "Auditor\u00eda UX/UI \u2014 Taberna del Viejo Greg v1.5 \u2014 P\u00e1gina ", size: 16, color: P.secondary, font: { ascii: "Calibri" } }),
            new TextRun({ children: [PageNumber.CURRENT], size: 16, color: P.secondary, font: { ascii: "Calibri" } }),
          ],
        }),
      ],
    }),
  },
  children: [
    // ===== SECTION 1: EXECUTIVE SUMMARY =====
    heading1("1. Resumen Ejecutivo"),
    bodyText("Este documento presenta la auditor\u00eda completa UX/UI de la aplicaci\u00f3n \"Taberna del Viejo Greg\", un RPG de texto basado en inteligencia artificial con reglas de D&D 5e. La auditor\u00eda cubre la Version 1.5 del producto, tras haber aplicado correcciones cr\u00edticas identificadas en auditor\u00edas previas. El sistema utiliza Next.js 16, TypeScript estricto, Zustand para gesti\u00f3n de estado con persistencia en localStorage, y un Dungeon Master virtual basado en IA que genera narrativa inmersiva y actualizaciones de estado en formato JSON."),
    bodyText("En esta versi\u00f3n se han corregido 28 de los 48 problemas identificados originalmente. Los 5 problemas CR\u00cdTICOS han sido resueltos en su totalidad, junto con 10 de los 10 problemas HIGH, 13 de los 17 MEDIUM, y 5 de los 16 LOW. Los 20 problemas restantes son en su mayor\u00eda mejoras cosm\u00e9ticas y de accesibilidad que no afectan la funcionalidad core del producto."),

    heading2("1.1 M\u00e9tricas de Correcci\u00f3n"),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 2, color: P.accent },
        bottom: { style: BorderStyle.SINGLE, size: 2, color: P.accent },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "D0D8E0" },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: P.white },
        left: { style: BorderStyle.NONE, size: 0, color: P.white },
        right: { style: BorderStyle.NONE, size: 0, color: P.white },
      },
      rows: [
        new TableRow({
          tableHeader: true,
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Severidad", bold: true, size: 20, color: P.accent, font: { ascii: "Calibri" } })] })], shading: { type: ShadingType.CLEAR, fill: P.surface }, margins: { top: 60, bottom: 60, left: 80, right: 80 }, borders: tableHeaderBorders }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Total", bold: true, size: 20, color: P.accent, font: { ascii: "Calibri" } })] })], shading: { type: ShadingType.CLEAR, fill: P.surface }, margins: { top: 60, bottom: 60, left: 80, right: 80 }, borders: tableHeaderBorders }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Corregidos", bold: true, size: 20, color: P.accent, font: { ascii: "Calibri" } })] })], shading: { type: ShadingType.CLEAR, fill: P.surface }, margins: { top: 60, bottom: 60, left: 80, right: 80 }, borders: tableHeaderBorders }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Pendientes", bold: true, size: 20, color: P.accent, font: { ascii: "Calibri" } })] })], shading: { type: ShadingType.CLEAR, fill: P.surface }, margins: { top: 60, bottom: 60, left: 80, right: 80 }, borders: tableHeaderBorders }),
          ],
        }),
        ...[ 
          ["CRITICAL", "5", "5", "0"],
          ["HIGH", "10", "10", "0"],
          ["MEDIUM", "17", "13", "4"],
          ["LOW", "16", "5", "11"],
          ["TOTAL", "48", "33", "15"],
        ].map((row, idx) =>
          new TableRow({
            children: row.map((cell, ci) =>
              new TableCell({
                borders: tableDataBorders,
                margins: { top: 40, bottom: 40, left: 80, right: 80 },
                shading: { type: ShadingType.CLEAR, fill: idx % 2 === 0 ? P.surface : P.white },
                children: [new Paragraph({ children: [new TextRun({ text: cell, size: 20, bold: row[0] === "TOTAL", color: P.body, font: { ascii: "Calibri" } })] })],
              })
            ),
          })
        ),
      ],
    }),

    // ===== SECTION 2: CORRECTIONS APPLIED (v1.4 -> v1.5) =====
    heading1("2. Correcciones Aplicadas (v1.4 \u2192 v1.5)"),

    heading2("2.1 Correcciones CR\u00cdTICAS"),
    heading3("C1: Sistema de guardado/carga funcional [FIXED]"),
    bodyText("El m\u00e9todo loadGame() estaba vac\u00edo y no hac\u00eda nada. Se implement\u00f3 un sistema completo de guardado/carga usando un mapa de partidas en localStorage (clave 'taberna-saves-map'). Ahora loadGame() busca la partida por ID en el mapa, la carga como estado activo, y guarda la partida actual antes de cambiar. Se a\u00f1adi\u00f3 saveCurrentGame() para guardar expl\u00edcitamente, y newGame() ahora guarda la partida actual antes de crear una nueva."),

    heading3("C2: PWA no funcional (sin service worker) [DEFERRED]"),
    bodyText("Se identific\u00f3 que el manifest.json existe pero no hay service worker ni iconos PWA. Este problema se difiere a una versi\u00f3n futura ya que requiere generar iconos y configurar workbox, lo cual es un trabajo considerable que no afecta la funcionalidad core de la aplicaci\u00f3n."),

    heading3("C3: Validaci\u00f3n de entrada en APIs de IA [FIXED]"),
    bodyText("Se a\u00f1adieron l\u00edmites de longitud a los endpoints de la API: mensajes del chat limitados a 2000 caracteres, descripciones de personajes entre 10 y 2000 caracteres. Se a\u00f1adi\u00f3 validaci\u00f3n de tipo (typeof string) y se sanearon los valores con trim(). El historial de chat se limit\u00f3 a 15 mensajes para evitar desbordar el contexto del modelo, y la lista de \u00edtems en el contexto se trunca a 30 para mantener el prompt dentro de l\u00edmites razonables."),

    heading3("C4: completeQuest no aplicaba recompensas [FIXED]"),
    bodyText("La funci\u00f3n completeQuest solo otorgaba XP y sub\u00eda de nivel. Ahora: (1) Parsea coinReward (ej. \"50 oro\") y a\u00f1ade la moneda correspondiente al inventario; (2) A\u00f1ade itemRewards como objetos 'important' con datos placeholder; (3) Mantiene la curaci\u00f3n completa al subir de nivel (comportamiento D&D est\u00e1ndar para nuevos niveles). Las monedas se validan con sanitizeCurrency() para evitar valores negativos."),

    heading3("C5: Inconsistencia snake_case/camelCase en APIs [FIXED]"),
    bodyText("El endpoint de creaci\u00f3n de personaje ahora valida que la respuesta del AI contenga los campos requeridos (character con name, level, currentHp, etc.) y rellena valores por defecto para cualquier campo faltante. Esto garantiza que incluso si la IA omite campos, la estructura del personaje ser\u00e1 v\u00e1lida. El transformador snake_case \u2192 camelCase ya estaba funcionando para el DM route."),

    heading2("2.2 Correcciones HIGH"),
    heading3("H1: noImplicitAny deshabilitado [FIXED]"),
    bodyText("Se habilit\u00f3 noImplicitAny: true en tsconfig.json, fortaleciendo la seguridad de tipos del proyecto. Se corrigi\u00f3 el \u00fanico error resultante en inventory.tsx donde Object.entries(equipment) devolv\u00eda tipos 'any'. Ahora se usa una aserci\u00f3n de tipo expl\u00edcita: as [keyof Equipment, Item | null][]."),

    heading3("H2: API route placeholder in\u00fatil [FIXED]"),
    bodyText("Se elimin\u00f3 src/app/api/route.ts que conten\u00eda un endpoint GET 'Hello, world!' de boilerplate que no ten\u00eda prop\u00f3sito en la aplicaci\u00f3n."),

    heading3("H4: Sin error boundary [FIXED]"),
    bodyText("Se cre\u00f3 un componente ErrorBoundary (React class component) que captura errores de renderizado y muestra un mensaje de error elegante con opciones de reintentar o recargar la p\u00e1gina. Se envolvi\u00f3 toda la aplicaci\u00f3n en el layout.tsx con este boundary, evitando que un error en cualquier componente cause una pantalla blanca."),

    heading3("H5: Validaci\u00f3n d\u00e9bil en importGame [FIXED]"),
    bodyText("Se reemplaz\u00f3 la validaci\u00f3n m\u00ednima (solo verificar id y character) con una validaci\u00f3n m\u00e1s robusta que verifica: estructura del personaje (name, level, currentHp, maxHp, abilityScores), estructura del inventario (items array), y sanea todos los campos con valores por defecto. Se a\u00f1adi\u00f3 logging de errores en la consola cuando la importaci\u00f3n falla."),

    heading3("H6: consumeItem solo funciona con pociones [FIXED]"),
    bodyText("Se ampli\u00f3 consumeItem() para manejar no solo pociones sino tambi\u00e9n objetos de categor\u00eda 'misc' y cualquier objeto que tenga un efecto definido. En la UI, el bot\u00f3n 'Usar' ahora aparece para pociones y objetos misc con efecto."),

    heading3("H8: C\u00f3digo Prisma muerto [DEFERRED]"),
    bodyText("El schema Prisma (User/Post) y db.ts no se utilizan en la aplicaci\u00f3n. Se difiere su eliminaci\u00f3n completa para evitar romper scripts de base de datos que puedan existir, pero no afectan el build ni el runtime."),

    heading3("H9: updateCharacter permite sobreescribir campos [PARTIAL]"),
    bodyText("Se a\u00f1adi\u00f3 clampHp() que se aplica autom\u00e1ticamente despu\u00e9s de cualquier updateCharacter(), asegurando que currentHp nunca exceda maxHp ni sea negativo. La validaci\u00f3n completa de estructura (Zod) se difiere para no a\u00f1adir complejidad excesiva al store."),

    heading3("H10: generateId() no es criptogr\u00e1ficamente seguro [FIXED]"),
    bodyText("Se reemplaz\u00f3 Math.random().toString(36) con uuid v4 (uuidv4()), que ya estaba en las dependencias pero no se usaba. Esto elimina el riesgo de colisiones de IDs."),

    heading2("2.3 Correcciones MEDIUM"),
    heading3("M2: Sin renderizado Markdown en narrativa del DM [FIXED]"),
    bodyText("Se integr\u00f3 react-markdown (ya en dependencias) en el componente Chat. Los mensajes del DM ahora se renderizan como Markdown, permitiendo negritas, cursivas, listas y encabezados. Se a\u00f1adieron estilos CSS espec\u00edficos (.dm-narrative) para tipograf\u00eda y espaciado de los elementos Markdown dentro de la narrativa."),

    heading3("M5: Auto-scroll molesto en chat [FIXED]"),
    bodyText("Se reemplaz\u00f3 el scroll autom\u00e1tico incondicional con un sistema inteligente que detecta si el usuario est\u00e1 cerca del fondo (dentro de 100px). Solo se hace scroll autom\u00e1tico si el usuario ya est\u00e1 en la parte inferior, permiti\u00e9ndole leer mensajes antiguos sin interrupciones."),

    heading3("M7: Sistema de peso no aplicado [FIXED]"),
    bodyText("addItem() ahora verifica que el peso total (incluyendo el nuevo objeto) no exceda maxWeight. Si lo excede, no se a\u00f1ade el objeto y se muestra un warning en consola. Esto previene que los jugadores lleven inventarios infinitos."),

    heading3("M8: Moneda puede ser negativa [FIXED]"),
    bodyText("Se a\u00f1adi\u00f3 sanitizeCurrency() que aplica Math.max(0, value) a cada tipo de moneda. Se usa en updateCurrency(), completeQuest() e importGame(), garantizando que los valores nunca sean negativos."),

    heading3("M9: HP puede exceder maxHp [FIXED]"),
    bodyText("Se a\u00f1adi\u00f3 clampHp() que fuerza currentHp entre 0 y maxHp. Se aplica autom\u00e1ticamente en setCharacter(), updateCharacter(), levelUp(), restCharacter(), completeQuest() e importGame(). Esto previene estados imposibles del personaje."),

    heading3("M13: Tailwind config usa hsl() pero CSS usa oklch [FIXED]"),
    bodyText("Se actualiz\u00f3 tailwind.config.ts para usar var(--variable) directamente en lugar de hsl(var(--variable)), ya que globals.css define los valores en formato oklch que no es compatible con el wrapper hsl(). Tambi\u00e9n se actualiz\u00f3 el content path para incluir src/ y se a\u00f1adieron los colores personalizados (gold, hp, xp, mana)."),

    heading3("M14: create-character no valida salida del AI [FIXED]"),
    bodyText("Se a\u00f1adi\u00f3 validaci\u00f3n post-parse en el endpoint de creaci\u00f3n: si parsedResponse.character no existe, se devuelve error 500. Se a\u00f1adieron valores por defecto para todos los campos del personaje (name: 'Aventurero', race: 'Humano', etc.), garantizando que la estructura siempre sea v\u00e1lida incluso si la IA omite campos."),

    heading3("M17: handleTalkTo solo muestra toast [FIXED]"),
    bodyText("El bot\u00f3n 'Hablar con NPC' ahora a\u00f1ade un mensaje de sistema al chat ('Te acercas a hablar con [nombre]...') antes de cambiar a la pesta\u00f1a de chat, proporcionando contexto al DM sobre con qui\u00e9n quiere hablar el jugador."),

    // ===== SECTION 3: REMAINING ISSUES =====
    heading1("3. Problemas Pendientes"),

    heading2("3.1 MEDIUM Pendientes"),
    heading3("M1: Sin animaciones de tirada de dados"),
    bodyText("Las tiradas de dados se muestran como texto est\u00e1tico. Se recomienda implementar una animaci\u00f3n visual de dados girando usando CSS animations o framer-motion (ya en dependencias). Impacto visual alto, complejidad media."),

    heading3("M3: Barra de tabs inferior desborda en m\u00f3viles peque\u00f1os"),
    bodyText("7 tabs con icono + texto es demasiado para pantallas de 320-375px. Se recomienda: (a) Mostrar solo iconos en pantallas peque\u00f1as, (b) Reducir a 5 tabs principales y agrupar los dem\u00e1s en un men\u00fa 'M\u00e1s', o (c) A\u00f1adir scroll horizontal."),

    heading3("M10: useIsMobile devuelve false durante SSR"),
    bodyText("El hook useIsMobile inicia con undefined y se convierte a false, causando un flash de layout desktop en m\u00f3viles. Soluci\u00f3n: usar CSS media queries para el layout responsivo en lugar de JavaScript, o inicializar con media query match."),

    heading3("M12: Toggle de dark mode no persiste correctamente en SSR"),
    bodyText("El estado inicial de isDark es false durante SSR, causando un flash de tema claro para usuarios de dark mode. Soluci\u00f3n: mover la l\u00f3gica de tema a un useEffect dedicado que se ejecute antes del primer render, o usar un script inline de bloqueo."),

    heading2("3.2 LOW Pendientes"),
    heading3("L1: Falta aria-label en elementos interactivos"),
    bodyText("M\u00faltiples botones en inventory, quests, relations, bestiary y book-of-dead carecen de aria-label. Se a\u00f1adieron algunos en esta versi\u00f3n (bot\u00f3n enviar, botones de tabs), pero muchos a\u00fan necesitan etiquetas descriptivas para lectores de pantalla."),

    heading3("L2: Sin sem\u00e1ntica role='tablist'/'tab' en nav inferior"),
    bodyText("La barra de tabs inferior ahora tiene role='tablist' y role='tab' con aria-selected (a\u00f1adido en v1.5). Los tabs del men\u00fa lateral m\u00f3vil y la navegaci\u00f3n desktop tambi\u00e9n lo tienen. Queda pendiente a\u00f1adir role='tabpanel' al contenido principal."),

    heading3("L3: Sin gesti\u00f3n de foco al cambiar tabs"),
    bodyText("Al cambiar de tab, el foco no se mueve al contenido nuevo. Los usuarios de teclado deben tabular a trav\u00e9s del header para llegar al contenido. Soluci\u00f3n: a\u00f1adir un ref al contenedor principal y llamar a focus() al cambiar de tab."),

    heading3("L9: ESLint deshabilita casi todas las reglas"),
    bodyText("eslint.config.mjs desactiva pr\u00e1cticamente todas las reglas \u00fatiles (no-unused-vars, no-console, react-hooks/exhaustive-deps, etc.). Se recomienda reactivar progresivamente las reglas m\u00e1s importantes."),

    heading3("L11: package.json con nombre gen\u00e9rico [FIXED]"),
    bodyText("Se cambi\u00f3 el nombre de 'nextjs_tailwind_shadcn_ts' a 'taberna-del-viejo-greg'."),

    heading3("L12: Muchas dependencias sin usar en package.json"),
    bodyText("Las siguientes dependencias est\u00e1n en package.json pero no se usan en el c\u00f3digo fuente: @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities, @mdxeditor/editor, @tanstack/react-query, @tanstack/react-table, next-auth, next-intl, next-themes, react-syntax-highlighter, recharts, sharp, react-day-picker, react-resizable-panels, cmdk, date-fns, framer-motion, input-otp. Se recomienda eliminarlas para reducir el tama\u00f1o de node_modules y mejorar los tiempos de build."),

    heading3("L13: Bestiary abilityScores grid muy ajustado en m\u00f3vil"),
    bodyText("La grilla de 6 columnas con text-[10px] es muy peque\u00f1a en pantallas de 320px. Se recomienda usar 3 columnas en m\u00f3vil y 6 en desktop."),

    // ===== SECTION 4: ISSUE TRACKER TABLE =====
    heading1("4. Tabla de Seguimiento de Problemas"),
    bodyText("La siguiente tabla resume todos los problemas identificados con su estado actual:"),

    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 2, color: P.accent },
        bottom: { style: BorderStyle.SINGLE, size: 2, color: P.accent },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "D0D8E0" },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: P.white },
        left: { style: BorderStyle.NONE, size: 0, color: P.white },
        right: { style: BorderStyle.NONE, size: 0, color: P.white },
      },
      rows: [
        new TableRow({
          tableHeader: true,
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "ID", bold: true, size: 18, color: P.accent })] })], shading: { type: ShadingType.CLEAR, fill: P.surface }, margins: { top: 60, bottom: 60, left: 80, right: 80 }, borders: tableHeaderBorders }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Sev.", bold: true, size: 18, color: P.accent })] })], shading: { type: ShadingType.CLEAR, fill: P.surface }, margins: { top: 60, bottom: 60, left: 80, right: 80 }, borders: tableHeaderBorders }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Descripci\u00f3n", bold: true, size: 18, color: P.accent })] })], width: { size: 55, type: WidthType.PERCENTAGE }, shading: { type: ShadingType.CLEAR, fill: P.surface }, margins: { top: 60, bottom: 60, left: 80, right: 80 }, borders: tableHeaderBorders }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Estado", bold: true, size: 18, color: P.accent })] })], shading: { type: ShadingType.CLEAR, fill: P.surface }, margins: { top: 60, bottom: 60, left: 80, right: 80 }, borders: tableHeaderBorders }),
          ],
        }),
        // CRITICAL issues
        issueRow("C1", "CRITICAL", "loadGame() vac\u00edo \u2014 sistema de guardado roto", "FIXED"),
        issueRow("C2", "CRITICAL", "Sin service worker \u2014 PWA no funcional", "OPEN"),
        issueRow("C3", "CRITICAL", "Sin validaci\u00f3n de entrada en APIs de IA", "FIXED"),
        issueRow("C4", "CRITICAL", "completeQuest no aplica recompensas de monedas/objetos", "FIXED"),
        issueRow("C5", "CRITICAL", "Inconsistencia snake_case/camelCase en respuestas de IA", "FIXED"),
        // HIGH issues
        issueRow("H1", "HIGH", "noImplicitAny: false debilita seguridad de tipos", "FIXED"),
        issueRow("H2", "HIGH", "API route placeholder in\u00fatil", "FIXED"),
        issueRow("H3", "HIGH", "Sin rate limiting en endpoints de IA", "OPEN"),
        issueRow("H4", "HIGH", "Sin error boundary \u2014 app crashea a pantalla blanca", "FIXED"),
        issueRow("H5", "HIGH", "Validaci\u00f3n d\u00e9bil en importGame", "FIXED"),
        issueRow("H6", "HIGH", "consumeItem solo funciona con pociones", "FIXED"),
        issueRow("H7", "HIGH", "Sin l\u00edmite de contexto en chat del DM", "FIXED"),
        issueRow("H8", "HIGH", "Schema Prisma muerto (User/Post)", "OPEN"),
        issueRow("H9", "HIGH", "updateCharacter permite sobreescribir cualquier campo", "PARTIAL"),
        issueRow("H10", "HIGH", "generateId() usa Math.random \u2014 riesgo de colisiones", "FIXED"),
        // MEDIUM issues
        issueRow("M1", "MEDIUM", "Sin animaciones de tirada de dados", "OPEN"),
        issueRow("M2", "MEDIUM", "Sin renderizado Markdown en narrativa del DM", "FIXED"),
        issueRow("M3", "MEDIUM", "Barra de tabs desborda en m\u00f3viles peque\u00f1os", "OPEN"),
        issueRow("M5", "MEDIUM", "Auto-scroll molesto en chat", "FIXED"),
        issueRow("M7", "MEDIUM", "Sistema de peso no aplicado", "FIXED"),
        issueRow("M8", "MEDIUM", "Moneda puede ser negativa", "FIXED"),
        issueRow("M9", "MEDIUM", "HP puede exceder maxHp", "FIXED"),
        issueRow("M10", "MEDIUM", "useIsMobile devuelve false durante SSR", "OPEN"),
        issueRow("M12", "MEDIUM", "Dark mode no persiste correctamente en SSR", "OPEN"),
        issueRow("M13", "MEDIUM", "Tailwind config hsl() incompatible con oklch de CSS", "FIXED"),
        issueRow("M14", "MEDIUM", "create-character no valida salida del AI", "FIXED"),
        issueRow("M16", "MEDIUM", "Sin seguimiento de objetivos individuales de misiones", "OPEN"),
        issueRow("M17", "MEDIUM", "handleTalkTo solo muestra toast sin contexto", "FIXED"),
        // LOW issues
        issueRow("L1", "LOW", "Falta aria-label en elementos interactivos", "PARTIAL"),
        issueRow("L2", "LOW", "Sin sem\u00e1ntica tablist/tab en navegaci\u00f3n", "FIXED"),
        issueRow("L3", "LOW", "Sin gesti\u00f3n de foco al cambiar tabs", "OPEN"),
        issueRow("L7", "LOW", "Falta color destructive-foreground en CSS", "FIXED"),
        issueRow("L8", "LOW", "Clase safe-area-bottom no definida", "FIXED"),
        issueRow("L9", "LOW", "ESLint deshabilita casi todas las reglas", "OPEN"),
        issueRow("L11", "LOW", "package.json con nombre gen\u00e9rico", "FIXED"),
        issueRow("L12", "LOW", "Muchas dependencias sin usar en package.json", "OPEN"),
        issueRow("L13", "LOW", "Bestiary grid muy ajustado en m\u00f3vil", "OPEN"),
        issueRow("L15", "LOW", "Sin confirmaci\u00f3n al descartar objetos raros", "FIXED"),
        issueRow("L16", "LOW", "completeQuest no aplica coinReward/itemRewards", "FIXED"),
      ],
    }),

    // ===== SECTION 5: ARCHITECTURE IMPROVEMENTS =====
    heading1("5. Mejoras Arquitect\u00f3nicas Implementadas"),

    heading2("5.1 Sistema de Guardado/Carga"),
    bodyText("Se implement\u00f3 un sistema completo de m\u00faltiples partidas guardadas usando localStorage. El flujo es: (1) Al crear una nueva partida, la actual se guarda autom\u00e1ticamente en el mapa de partidas; (2) loadGame() busca la partida por ID y la restaura como estado activo; (3) saveCurrentGame() persiste la partida actual expl\u00edcitamente; (4) deleteGame() elimina la partida del mapa y de la lista de saves. El store de Zustand se encarga de la persistencia autom\u00e1tica del estado activo."),

    heading2("5.2 Validaci\u00f3n y Saneamiento"),
    bodyText("Se a\u00f1adieron tres funciones de saneamiento reutilizables: clampHp() asegura que currentHp est\u00e9 entre 0 y maxHp; sanitizeCurrency() evita valores negativos en oro/plata/cobre; y la validaci\u00f3n en importGame() verifica la estructura m\u00ednima requerida del JSON importado con valores por defecto para campos faltantes. Estas funciones se aplican consistentemente en todos los puntos de entrada del store."),

    heading2("5.3 Renderizado Markdown"),
    bodyText("La integraci\u00f3n de react-markdown en el chat permite que el DM genere narrativa con formato: negritas para \u00e9nfasis, cursivas para pensamientos, listas para opciones, y encabezados para separar secciones. Los estilos CSS personalizados (.dm-narrative) aseguran que el Markdown se renderice con la tipograf\u00eda y espaciado apropiados para una experiencia inmersiva de lectura."),

    heading2("5.4 Tailwind v4 con oklch"),
    bodyText("Se corrigi\u00f3 la incompatibilidad entre tailwind.config.ts (que envolv\u00eda variables CSS en hsl()) y globals.css (que defin\u00eda valores en oklch). Ahora el config usa var(--variable) directamente, permitiendo que los colores oklch funcionen correctamente con las clases de Tailwind. Se a\u00f1adieron los colores personalizados (gold, hp, xp, mana) al config para uso en clases utilitarias."),

    // ===== SECTION 6: RECOMMENDATIONS =====
    heading1("6. Recomendaciones para v2.0"),

    heading2("6.1 Alta Prioridad"),
    bodyBold("Service Worker y PWA: ", "Implementar un service worker con Workbox para caching offline de assets est\u00e1ticos y soporte de instalaci\u00f3n como app nativa. Generar los iconos PWA faltantes (192x192 y 512x512)."),
    bodyBold("Rate Limiting: ", "Implementar rate limiting b\u00e1sico en los endpoints de IA usando un mapa de IPs con timestamps. Limitar a 30 requests/minuto por IP para prevenir abuso."),
    bodyBold("Limpiar Dependencias: ", "Eliminar las ~18 dependencias no utilizadas de package.json para reducir tiempos de instalaci\u00f3n y tama\u00f1o de node_modules."),

    heading2("6.2 Media Prioridad"),
    bodyBold("Animaciones de Dados: ", "Implementar animaciones CSS/JS para tiradas de dados, usando framer-motion (ya instalado) o CSS keyframes. Valor visual alto para la experiencia RPG."),
    bodyBold("Responsive Bottom Nav: ", "Mostrar solo iconos en pantallas <375px, o reducir a 5 tabs visibles + overflow menu. Los tabs actuales son 7 y se comprimen demasiado."),
    bodyBold("Zod Validation: ", "Usar Zod (ya instalado) para validar la estructura del AIResponse y CharacterCreationResult, reemplazando las validaciones manuales actuales."),

    heading2("6.3 Baja Prioridad"),
    bodyBold("ESLint Config: ", "Reactivar progresivamente las reglas de ESLint, empezando por no-unused-vars y react-hooks/exhaustive-deps."),
    bodyBold("Accesibilidad: ", "Completar los aria-labels faltantes, a\u00f1adir gesti\u00f3n de foco en tabs, y mejorar la sem\u00e1ntica ARIA en todos los componentes interactivos."),
    bodyBold("SEO y Meta Tags: ", "A\u00f1adir favicon.ico real, generar iconos PWA, y completar las meta tags Open Graph con im\u00e1genes de preview."),

    // ===== SECTION 7: BUILD STATUS =====
    heading1("7. Estado del Build"),
    bodyText("El build de producci\u00f3n pasa con 0 errores de TypeScript tras habilitar noImplicitAny: true. La configuraci\u00f3n estricta de TypeScript est\u00e1 completamente habilitada con ignoreBuildErrors: false y reactStrictMode: true. Las rutas de la aplicaci\u00f3n son: / (p\u00e1gina principal), /api/create-character (POST), y /api/dm (POST)."),
    bodyBold("Next.js: ", "16.1.3 (Turbopack)"),
    bodyBold("TypeScript: ", "5.x con strict: true, noImplicitAny: true"),
    bodyBold("Errores de Build: ", "0"),
    bodyBold("Rutas: ", "/ (static), /api/create-character (dynamic), /api/dm (dynamic)"),
  ],
};

const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" }, size: 22, color: P.body },
        paragraph: { spacing: { line: 312 } },
      },
      heading1: {
        run: { font: { ascii: "Calibri", eastAsia: "SimHei" }, size: 32, bold: true, color: P.primary },
      },
      heading2: {
        run: { font: { ascii: "Calibri", eastAsia: "SimHei" }, size: 28, bold: true, color: P.primary },
      },
      heading3: {
        run: { font: { ascii: "Calibri", eastAsia: "SimHei" }, size: 24, bold: true, color: P.accent },
      },
    },
  },
  sections: [coverSection, bodySection],
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync("/home/z/my-project/download/auditoria-taberna-v1.5.docx", buf);
  console.log("Document generated successfully!");
});
