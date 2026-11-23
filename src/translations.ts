/*
 * Translations for the visual (Strings) and its format pane (PaneStrings).
 *
 * Languages chosen by Power BI market relevance: English, Portuguese (Portugal and
 * Brazil), Spanish, French, German, Italian, Simplified Chinese and Japanese. Any other
 * Power BI language falls back to English. Dates and month names are not here: they
 * come from Intl and therefore work in every locale.
 *
 * Machine-assisted translations: have native speakers review them before publishing,
 * especially the format pane (what report authors see).
 */
import type { PresetId } from "./dateRange";

/** Headings of the quick-periods list. */
export type PresetGroup = "days" | "months" | "quarters" | "years";

/** Texts shown in the visual itself (report readers and authors). */
export interface Strings {
    presets: Record<PresetId, string>;
    presetGroups: Record<PresetGroup, string>;
    all: string;
    custom: string;
    choosePeriod: string;
    quickPeriods: string;
    defaultPeriod: string;
    /** Tooltip hints for the shortcuts back to the default period. */
    resetCtrlClick: string;
    resetDoubleClick: string;
    /** Uses {current} and {default} placeholders. */
    saveWarning: string;
    dialogTitle: string;
    dialogUnavailable: string;
    dialogBlocked: string;
    dialogNotAllowed: string;
    dialogAlreadyOpen: string;
    /** Accessible names of the start/end rows (the rows themselves show ●━ / ━●). */
    from: string;
    to: string;
    previousPeriod: string;
    nextPeriod: string;
    previousMonth: string;
    nextMonth: string;
    pickEnd: string;
    quarterPrefix: string;
    landingTitle: string;
    landingBy: string;
    landingTagline: string;
    landingFeatures: string[];
    /** How to start (shown on every landing size). */
    landingText: string;
    landingLink: string;
    notADate: string;
}

/** Texts of the format pane (report authors). */
export interface PaneStrings {
    period: string;
    defaultPeriod: string;
    noneAllDates: string;
    language: string;
    autoLanguage: string;
    dateStyle: string;
    dateAuto: string;
    dateShort: string;
    dateNumeric: string;
    dateLong: string;
    weekStart: string;
    autoWeek: string;
    monday: string;
    sunday: string;
    presetsCard: string;
    layout: string;
    mode: string;
    modeCompact: string;
    modePanel: string;
    dateSelection: string;
    stackedFields: string;
    dialogWindow: string;
    arrows: string;
    appearance: string;
    accentColor: string;
    textColor: string;
    font: string;
    textSize: string;
    cornerRadius: string;
}

/** Languages with their own translation. */
export type LanguageKey = "en" | "ptPT" | "ptBR" | "es" | "fr" | "de" | "it" | "zh" | "ja";

/**
 * Maps a Power BI / BCP 47 locale to a translation.
 * @param locale e.g. "pt-PT", "pt-BR", "de-DE", "zh-CN".
 * @returns The language key; English for anything not translated.
 */
export function languageKey(locale: string): LanguageKey {
    const tag = (locale ?? "").toLowerCase();
    const language = tag.split(/[-_]/)[0];
    switch (language) {
        case "pt": return tag.startsWith("pt-br") ? "ptBR" : "ptPT";
        case "es": return "es";
        case "fr": return "fr";
        case "de": return "de";
        case "it": return "it";
        case "ja": return "ja";
        // Simplified Chinese only; Traditional (zh-TW/zh-HK) readers get English rather
        // than a script they don't use.
        case "zh": return /^zh(-hans|-cn|-sg)?($|-)/.test(tag) && !/-(tw|hk|mo|hant)/.test(tag) ? "zh" : "en";
        default: return "en";
    }
}

// ---------------------------------------------------------------------------
// Visual texts
// ---------------------------------------------------------------------------

const en: Strings = {
    presets: {
        today: "Today",
        yesterday: "Yesterday",
        last7Days: "Last 7 days",
        last30Days: "Last 30 days",
        thisMonth: "This month",
        lastMonth: "Last month",
        thisQuarter: "This quarter",
        lastQuarter: "Last quarter",
        yearToDate: "Year to date",
        last12Months: "Last 12 months",
        thisYear: "This year",
        lastYear: "Last year",
    },
    presetGroups: { days: "Days", months: "Months", quarters: "Quarters", years: "Years" },
    all: "All dates",
    custom: "Custom",
    choosePeriod: "Choose a period",
    quickPeriods: "Quick periods",
    defaultPeriod: "Default period",
    resetCtrlClick: "Ctrl + click: back to the default period",
    resetDoubleClick: "Double-click: back to the default period",
    saveWarning: "If you save now, the report will open with {current}. The default period is {default}.",
    dialogTitle: "Choose period",
    dialogUnavailable: "The pop-up calendar could not be opened (only report authors see this)",
    dialogBlocked: "The pop-up calendar was blocked (\"Don't show dialogs from this visual\"). Close and reopen Power BI Desktop, or reload the page in the Power BI service, to enable it again.",
    dialogNotAllowed: "Pop-up windows aren't allowed here (e.g. embedded report, publish to web or dashboard). Use the date fields instead.",
    dialogAlreadyOpen: "Another pop-up window is already open. Close it and try again.",
    from: "From",
    to: "To",
    previousPeriod: "Previous period",
    nextPeriod: "Next period",
    previousMonth: "Previous month",
    nextMonth: "Next month",
    pickEnd: "Now pick the end date",
    quarterPrefix: "Q",
    landingTitle: "Timeframe",
    landingBy: "Date Range Slicer · by Sersight",
    landingTagline: "The date slicer that always shows exactly what it is filtering.",
    landingFeatures: [
        "Start and end fields, each with its own calendar, or a pop-up range calendar",
        "Quick periods: today, last month, last 30 days, year to date…",
        "Rolling periods: \"Last month\" moves forward on its own",
        "Arrows to step one period back or forward",
        "Works with bookmarks and synced slicers",
        "Customizable: colors, font, language and date format",
    ],
    landingText: "To start, add a date column to the visual.",
    landingLink: "Learn more at sersight.com",
    notADate: "The field must be a date column. If you see Year/Quarter/Month/Day, pick the date itself instead of the date hierarchy.",
};

const ptPT: Strings = {
    presets: {
        today: "Hoje",
        yesterday: "Ontem",
        last7Days: "Últimos 7 dias",
        last30Days: "Últimos 30 dias",
        thisMonth: "Este mês",
        lastMonth: "Mês passado",
        thisQuarter: "Este trimestre",
        lastQuarter: "Trimestre passado",
        yearToDate: "Ano até à data",
        last12Months: "Últimos 12 meses",
        thisYear: "Este ano",
        lastYear: "Ano passado",
    },
    presetGroups: { days: "Dias", months: "Meses", quarters: "Trimestres", years: "Anos" },
    all: "Todas as datas",
    custom: "Personalizado",
    choosePeriod: "Escolha o período",
    quickPeriods: "Períodos rápidos",
    defaultPeriod: "Período por omissão",
    resetCtrlClick: "Ctrl + clique: voltar ao período por omissão",
    resetDoubleClick: "Duplo clique: voltar ao período por omissão",
    saveWarning: "Se gravar agora, o relatório abre com {current}. O período por omissão é {default}.",
    dialogTitle: "Escolher período",
    dialogUnavailable: "Não foi possível abrir o calendário em popup (só os autores do relatório veem isto)",
    dialogBlocked: "O calendário em popup foi bloqueado (\"Não mostrar diálogos deste visual\"). Feche e volte a abrir o Power BI Desktop, ou recarregue a página no serviço Power BI, para o reativar.",
    dialogNotAllowed: "Aqui não são permitidas janelas popup (ex.: relatório incorporado, publicado na Web ou dashboard). Use os campos de data.",
    dialogAlreadyOpen: "Já existe outra janela popup aberta. Feche-a e tente de novo.",
    from: "De",
    to: "Até",
    previousPeriod: "Período anterior",
    nextPeriod: "Período seguinte",
    previousMonth: "Mês anterior",
    nextMonth: "Mês seguinte",
    pickEnd: "Agora escolha a data de fim",
    quarterPrefix: "T",
    landingTitle: "Timeframe",
    landingBy: "Date Range Slicer · por Sersight",
    landingTagline: "O filtro de datas que mostra sempre exatamente o que está a filtrar.",
    landingFeatures: [
        "Campos de início e fim, cada um com o seu calendário, ou um calendário de intervalo em popup",
        "Períodos rápidos: hoje, mês passado, últimos 30 dias, ano até à data…",
        "Períodos que acompanham o tempo: o \"Mês passado\" avança sozinho",
        "Setas para recuar ou avançar um período",
        "Compatível com marcadores e sincronização de segmentações",
        "Personalizável: cores, tipo de letra, idioma e formato das datas",
    ],
    landingText: "Para começar, adicione uma coluna de data ao visual.",
    landingLink: "Saiba mais em sersight.com",
    notADate: "O campo tem de ser uma coluna de data. Se vê Ano/Trimestre/Mês/Dia, escolha a própria data em vez da hierarquia.",
};

const ptBR: Strings = {
    ...ptPT,
    resetCtrlClick: "Ctrl + clique: voltar ao período padrão",
    resetDoubleClick: "Clique duplo: voltar ao período padrão",
    presets: { ...ptPT.presets, yearToDate: "Ano até a data" },
    choosePeriod: "Escolha o período",
    defaultPeriod: "Período padrão",
    saveWarning: "Se você salvar agora, o relatório abrirá com {current}. O período padrão é {default}.",
    dialogUnavailable: "Não foi possível abrir o calendário pop-up (somente os autores do relatório veem isto)",
    dialogBlocked: "O calendário pop-up foi bloqueado (\"Não mostrar caixas de diálogo deste visual\"). Feche e abra novamente o Power BI Desktop, ou recarregue a página no serviço do Power BI, para reativá-lo.",
    dialogNotAllowed: "Janelas pop-up não são permitidas aqui (ex.: relatório inserido, publicado na Web ou dashboard). Use os campos de data.",
    dialogAlreadyOpen: "Outra janela pop-up já está aberta. Feche-a e tente novamente.",
    nextPeriod: "Próximo período",
    nextMonth: "Próximo mês",
    pickEnd: "Agora escolha a data final",
    landingTagline: "O filtro de datas que sempre mostra exatamente o que está filtrando.",
    landingFeatures: [
        "Campos de início e fim, cada um com seu calendário, ou um calendário de intervalo pop-up",
        "Períodos rápidos: hoje, mês passado, últimos 30 dias, ano até a data…",
        "Períodos dinâmicos: o \"Mês passado\" avança sozinho",
        "Setas para voltar ou avançar um período",
        "Compatível com indicadores e segmentações sincronizadas",
        "Personalizável: cores, fonte, idioma e formato de data",
    ],
    notADate: "O campo precisa ser uma coluna de data. Se você vê Ano/Trimestre/Mês/Dia, escolha a própria data em vez da hierarquia.",
};

const es: Strings = {
    presets: {
        today: "Hoy",
        yesterday: "Ayer",
        last7Days: "Últimos 7 días",
        last30Days: "Últimos 30 días",
        thisMonth: "Este mes",
        lastMonth: "Mes pasado",
        thisQuarter: "Este trimestre",
        lastQuarter: "Trimestre pasado",
        yearToDate: "Año hasta la fecha",
        last12Months: "Últimos 12 meses",
        thisYear: "Este año",
        lastYear: "Año pasado",
    },
    presetGroups: { days: "Días", months: "Meses", quarters: "Trimestres", years: "Años" },
    all: "Todas las fechas",
    custom: "Personalizado",
    choosePeriod: "Elija un período",
    quickPeriods: "Períodos rápidos",
    defaultPeriod: "Período predeterminado",
    resetCtrlClick: "Ctrl + clic: volver al período predeterminado",
    resetDoubleClick: "Doble clic: volver al período predeterminado",
    saveWarning: "Si guarda ahora, el informe se abrirá con {current}. El período predeterminado es {default}.",
    dialogTitle: "Elegir período",
    dialogUnavailable: "No se pudo abrir el calendario emergente (solo lo ven los autores del informe)",
    dialogBlocked: "El calendario emergente se bloqueó (\"No mostrar cuadros de diálogo de este objeto visual\"). Cierre y vuelva a abrir Power BI Desktop, o recargue la página en el servicio Power BI, para volver a activarlo.",
    dialogNotAllowed: "Aquí no se permiten ventanas emergentes (p. ej., informe insertado, publicado en la web o panel). Use los campos de fecha.",
    dialogAlreadyOpen: "Ya hay otra ventana emergente abierta. Ciérrela e inténtelo de nuevo.",
    from: "Desde",
    to: "Hasta",
    previousPeriod: "Período anterior",
    nextPeriod: "Período siguiente",
    previousMonth: "Mes anterior",
    nextMonth: "Mes siguiente",
    pickEnd: "Ahora elija la fecha de fin",
    quarterPrefix: "T",
    landingTitle: "Timeframe",
    landingBy: "Date Range Slicer · por Sersight",
    landingTagline: "El filtro de fechas que siempre muestra exactamente lo que está filtrando.",
    landingFeatures: [
        "Campos de inicio y fin, cada uno con su calendario, o un calendario de intervalo emergente",
        "Períodos rápidos: hoy, mes pasado, últimos 30 días, año hasta la fecha…",
        "Períodos dinámicos: \"Mes pasado\" avanza solo",
        "Flechas para retroceder o avanzar un período",
        "Compatible con marcadores y segmentaciones sincronizadas",
        "Personalizable: colores, fuente, idioma y formato de fecha",
    ],
    landingText: "Para empezar, agregue una columna de fecha al objeto visual.",
    landingLink: "Más información en sersight.com",
    notADate: "El campo debe ser una columna de fecha. Si ve Año/Trimestre/Mes/Día, elija la propia fecha en lugar de la jerarquía de fechas.",
};

const fr: Strings = {
    presets: {
        today: "Aujourd'hui",
        yesterday: "Hier",
        last7Days: "7 derniers jours",
        last30Days: "30 derniers jours",
        thisMonth: "Ce mois-ci",
        lastMonth: "Mois dernier",
        thisQuarter: "Ce trimestre",
        lastQuarter: "Trimestre dernier",
        yearToDate: "Année à ce jour",
        last12Months: "12 derniers mois",
        thisYear: "Cette année",
        lastYear: "Année dernière",
    },
    presetGroups: { days: "Jours", months: "Mois", quarters: "Trimestres", years: "Années" },
    all: "Toutes les dates",
    custom: "Personnalisé",
    choosePeriod: "Choisissez une période",
    quickPeriods: "Périodes rapides",
    defaultPeriod: "Période par défaut",
    resetCtrlClick: "Ctrl + clic : revenir à la période par défaut",
    resetDoubleClick: "Double-clic : revenir à la période par défaut",
    saveWarning: "Si vous enregistrez maintenant, le rapport s'ouvrira sur {current}. La période par défaut est {default}.",
    dialogTitle: "Choisir la période",
    dialogUnavailable: "Impossible d'ouvrir le calendrier contextuel (seuls les auteurs du rapport voient ce message)",
    dialogBlocked: "Le calendrier contextuel a été bloqué (« Ne pas afficher les boîtes de dialogue de ce visuel »). Fermez et rouvrez Power BI Desktop, ou rechargez la page dans le service Power BI, pour le réactiver.",
    dialogNotAllowed: "Les fenêtres contextuelles ne sont pas autorisées ici (rapport incorporé, publication sur le web ou tableau de bord, par ex.). Utilisez les champs de date.",
    dialogAlreadyOpen: "Une autre fenêtre contextuelle est déjà ouverte. Fermez-la et réessayez.",
    from: "Du",
    to: "Au",
    previousPeriod: "Période précédente",
    nextPeriod: "Période suivante",
    previousMonth: "Mois précédent",
    nextMonth: "Mois suivant",
    pickEnd: "Choisissez maintenant la date de fin",
    quarterPrefix: "T",
    landingTitle: "Timeframe",
    landingBy: "Date Range Slicer · par Sersight",
    landingTagline: "Le segment de dates qui affiche toujours exactement ce qu'il filtre.",
    landingFeatures: [
        "Champs début et fin, chacun avec son calendrier, ou un calendrier de plage contextuel",
        "Périodes rapides : aujourd'hui, mois dernier, 30 derniers jours, année à ce jour…",
        "Périodes glissantes : « Mois dernier » avance tout seul",
        "Flèches pour reculer ou avancer d'une période",
        "Compatible avec les signets et la synchronisation des segments",
        "Personnalisable : couleurs, police, langue et format de date",
    ],
    landingText: "Pour commencer, ajoutez une colonne de date au visuel.",
    landingLink: "En savoir plus sur sersight.com",
    notADate: "Le champ doit être une colonne de date. Si vous voyez Année/Trimestre/Mois/Jour, choisissez la date elle-même plutôt que la hiérarchie de dates.",
};

const de: Strings = {
    presets: {
        today: "Heute",
        yesterday: "Gestern",
        last7Days: "Letzte 7 Tage",
        last30Days: "Letzte 30 Tage",
        thisMonth: "Dieser Monat",
        lastMonth: "Letzter Monat",
        thisQuarter: "Dieses Quartal",
        lastQuarter: "Letztes Quartal",
        yearToDate: "Seit Jahresbeginn",
        last12Months: "Letzte 12 Monate",
        thisYear: "Dieses Jahr",
        lastYear: "Letztes Jahr",
    },
    presetGroups: { days: "Tage", months: "Monate", quarters: "Quartale", years: "Jahre" },
    // "Alle Daten" would read as "all data"; "Zeiträume" (periods) is unambiguous.
    all: "Gesamter Zeitraum",
    custom: "Benutzerdefiniert",
    choosePeriod: "Zeitraum wählen",
    quickPeriods: "Schnellauswahl",
    defaultPeriod: "Standardzeitraum",
    resetCtrlClick: "Strg + Klick: zurück zum Standardzeitraum",
    resetDoubleClick: "Doppelklick: zurück zum Standardzeitraum",
    saveWarning: "Wenn Sie jetzt speichern, wird der Bericht mit {current} geöffnet. Der Standardzeitraum ist {default}.",
    dialogTitle: "Zeitraum wählen",
    dialogUnavailable: "Der Popup-Kalender konnte nicht geöffnet werden (nur für Berichtsautoren sichtbar)",
    dialogBlocked: "Der Popup-Kalender wurde blockiert („Keine Dialogfelder dieses Visuals anzeigen“). Schließen Sie Power BI Desktop und öffnen Sie es erneut, oder laden Sie die Seite im Power BI-Dienst neu, um ihn wieder zu aktivieren.",
    dialogNotAllowed: "Popup-Fenster sind hier nicht erlaubt (z. B. eingebetteter Bericht, Im Web veröffentlichen oder Dashboard). Verwenden Sie die Datumsfelder.",
    dialogAlreadyOpen: "Ein anderes Popup-Fenster ist bereits geöffnet. Schließen Sie es und versuchen Sie es erneut.",
    from: "Von",
    to: "Bis",
    previousPeriod: "Vorheriger Zeitraum",
    nextPeriod: "Nächster Zeitraum",
    previousMonth: "Vorheriger Monat",
    nextMonth: "Nächster Monat",
    pickEnd: "Wählen Sie jetzt das Enddatum",
    quarterPrefix: "Q",
    landingTitle: "Timeframe",
    landingBy: "Date Range Slicer · von Sersight",
    landingTagline: "Der Datumsslicer, der immer genau zeigt, was er filtert.",
    landingFeatures: [
        "Start- und Endfeld mit je eigenem Kalender oder ein Popup-Kalender für den Zeitraum",
        "Schnellauswahl: heute, letzter Monat, letzte 30 Tage, seit Jahresbeginn …",
        "Rollierende Zeiträume: „Letzter Monat“ läuft automatisch mit",
        "Pfeile, um einen Zeitraum zurück oder vor zu springen",
        "Funktioniert mit Lesezeichen und synchronisierten Datenschnitten",
        "Anpassbar: Farben, Schriftart, Sprache und Datumsformat",
    ],
    landingText: "Fügen Sie zum Start eine Datumsspalte zum Visual hinzu.",
    landingLink: "Mehr erfahren auf sersight.com",
    notADate: "Das Feld muss eine Datumsspalte sein. Wenn Sie Jahr/Quartal/Monat/Tag sehen, wählen Sie das Datum selbst statt der Datumshierarchie.",
};

const it: Strings = {
    presets: {
        today: "Oggi",
        yesterday: "Ieri",
        last7Days: "Ultimi 7 giorni",
        last30Days: "Ultimi 30 giorni",
        thisMonth: "Questo mese",
        lastMonth: "Mese scorso",
        thisQuarter: "Questo trimestre",
        lastQuarter: "Trimestre scorso",
        yearToDate: "Da inizio anno",
        last12Months: "Ultimi 12 mesi",
        thisYear: "Quest'anno",
        lastYear: "Anno scorso",
    },
    presetGroups: { days: "Giorni", months: "Mesi", quarters: "Trimestri", years: "Anni" },
    all: "Tutte le date",
    custom: "Personalizzato",
    choosePeriod: "Scegli un periodo",
    quickPeriods: "Periodi rapidi",
    defaultPeriod: "Periodo predefinito",
    resetCtrlClick: "Ctrl + clic: torna al periodo predefinito",
    resetDoubleClick: "Doppio clic: torna al periodo predefinito",
    saveWarning: "Se salvi ora, il report si aprirà con {current}. Il periodo predefinito è {default}.",
    dialogTitle: "Scegli periodo",
    dialogUnavailable: "Impossibile aprire il calendario pop-up (visibile solo agli autori del report)",
    dialogBlocked: "Il calendario pop-up è stato bloccato (\"Non mostrare finestre di dialogo da questo oggetto visivo\"). Chiudi e riapri Power BI Desktop, oppure ricarica la pagina nel servizio Power BI, per riattivarlo.",
    dialogNotAllowed: "Qui le finestre pop-up non sono consentite (ad es. report incorporato, pubblicazione sul Web o dashboard). Usa i campi data.",
    dialogAlreadyOpen: "È già aperta un'altra finestra pop-up. Chiudila e riprova.",
    from: "Dal",
    to: "Al",
    previousPeriod: "Periodo precedente",
    nextPeriod: "Periodo successivo",
    previousMonth: "Mese precedente",
    nextMonth: "Mese successivo",
    pickEnd: "Ora scegli la data di fine",
    quarterPrefix: "T",
    landingTitle: "Timeframe",
    landingBy: "Date Range Slicer · di Sersight",
    landingTagline: "Il filtro date che mostra sempre esattamente cosa sta filtrando.",
    landingFeatures: [
        "Campi inizio e fine, ciascuno con il proprio calendario, o un calendario pop-up dell'intervallo",
        "Periodi rapidi: oggi, mese scorso, ultimi 30 giorni, da inizio anno…",
        "Periodi dinamici: \"Mese scorso\" avanza da solo",
        "Frecce per andare indietro o avanti di un periodo",
        "Compatibile con segnalibri e filtri dei dati sincronizzati",
        "Personalizzabile: colori, carattere, lingua e formato data",
    ],
    landingText: "Per iniziare, aggiungi una colonna di date all'oggetto visivo.",
    landingLink: "Scopri di più su sersight.com",
    notADate: "Il campo deve essere una colonna di date. Se vedi Anno/Trimestre/Mese/Giorno, scegli la data stessa invece della gerarchia di date.",
};

const zh: Strings = {
    presets: {
        today: "今天",
        yesterday: "昨天",
        last7Days: "最近 7 天",
        last30Days: "最近 30 天",
        thisMonth: "本月",
        lastMonth: "上月",
        thisQuarter: "本季度",
        lastQuarter: "上季度",
        yearToDate: "年初至今",
        last12Months: "最近 12 个月",
        thisYear: "今年",
        lastYear: "去年",
    },
    presetGroups: { days: "日", months: "月", quarters: "季度", years: "年" },
    all: "所有日期",
    custom: "自定义",
    choosePeriod: "选择时间段",
    quickPeriods: "快速选择",
    defaultPeriod: "默认时间段",
    resetCtrlClick: "Ctrl + 单击：恢复默认时间段",
    resetDoubleClick: "双击：恢复默认时间段",
    saveWarning: "如果现在保存，报表将以 {current} 打开。默认时间段为 {default}。",
    dialogTitle: "选择时间段",
    dialogUnavailable: "无法打开弹出日历（仅报表作者可见）",
    dialogBlocked: "弹出日历已被阻止（“不显示此视觉对象的对话框”）。请关闭并重新打开 Power BI Desktop，或在 Power BI 服务中重新加载页面以重新启用。",
    dialogNotAllowed: "此处不允许弹出窗口（例如嵌入式报表、发布到 Web 或仪表板）。请使用日期字段。",
    dialogAlreadyOpen: "已有另一个弹出窗口打开。请关闭后重试。",
    from: "开始",
    to: "结束",
    previousPeriod: "上一时间段",
    nextPeriod: "下一时间段",
    previousMonth: "上个月",
    nextMonth: "下个月",
    pickEnd: "现在选择结束日期",
    quarterPrefix: "Q",
    landingTitle: "Timeframe",
    landingBy: "Date Range Slicer · Sersight 出品",
    landingTagline: "始终准确显示筛选内容的日期切片器。",
    landingFeatures: [
        "开始和结束字段各有自己的日历，或使用弹出式范围日历",
        "快速选择：今天、上月、最近 30 天、年初至今…",
        "滚动时间段：“上月”会自动向前推移",
        "使用箭头向前或向后移动一个时间段",
        "支持书签和同步切片器",
        "可自定义：颜色、字体、语言和日期格式",
    ],
    landingText: "首先，将日期列添加到此视觉对象。",
    landingLink: "在 sersight.com 了解更多",
    notADate: "该字段必须是日期列。如果看到年/季度/月/日，请选择日期本身，而不是日期层次结构。",
};

const ja: Strings = {
    presets: {
        today: "今日",
        yesterday: "昨日",
        last7Days: "過去 7 日間",
        last30Days: "過去 30 日間",
        thisMonth: "今月",
        lastMonth: "先月",
        thisQuarter: "今四半期",
        lastQuarter: "前四半期",
        yearToDate: "年初来",
        last12Months: "過去 12 か月",
        thisYear: "今年",
        lastYear: "昨年",
    },
    presetGroups: { days: "日", months: "月", quarters: "四半期", years: "年" },
    all: "すべての日付",
    custom: "カスタム",
    choosePeriod: "期間を選択",
    quickPeriods: "クイック選択",
    defaultPeriod: "既定の期間",
    resetCtrlClick: "Ctrl + クリック: 既定の期間に戻す",
    resetDoubleClick: "ダブルクリック: 既定の期間に戻す",
    saveWarning: "今保存すると、レポートは {current} で開きます。既定の期間は {default} です。",
    dialogTitle: "期間を選択",
    dialogUnavailable: "ポップアップ カレンダーを開けませんでした (レポート作成者にのみ表示されます)",
    dialogBlocked: "ポップアップ カレンダーがブロックされました (「このビジュアルのダイアログ ボックスを表示しない」)。再度有効にするには、Power BI Desktop を閉じて開き直すか、Power BI サービスでページを再読み込みしてください。",
    dialogNotAllowed: "ここではポップアップ ウィンドウを使用できません (埋め込みレポート、Web に公開、ダッシュボードなど)。日付フィールドを使用してください。",
    dialogAlreadyOpen: "別のポップアップ ウィンドウが既に開いています。閉じてからもう一度お試しください。",
    from: "開始",
    to: "終了",
    previousPeriod: "前の期間",
    nextPeriod: "次の期間",
    previousMonth: "前月",
    nextMonth: "翌月",
    pickEnd: "終了日を選択してください",
    quarterPrefix: "Q",
    landingTitle: "Timeframe",
    landingBy: "Date Range Slicer · 提供: Sersight",
    landingTagline: "フィルター中の期間を常に正確に表示する日付スライサー。",
    landingFeatures: [
        "開始・終了フィールドにそれぞれカレンダー、またはポップアップの範囲カレンダー",
        "クイック選択: 今日、先月、過去 30 日間、年初来…",
        "ローリング期間: 「先月」は自動的に更新",
        "矢印で期間を前後に移動",
        "ブックマークと同期スライサーに対応",
        "カスタマイズ可能: 色、フォント、言語、日付形式",
    ],
    landingText: "まず、日付列をこのビジュアルに追加してください。",
    landingLink: "詳しくは sersight.com へ",
    notADate: "このフィールドは日付列である必要があります。年/四半期/月/日が表示される場合は、日付階層ではなく日付自体を選択してください。",
};

// ---------------------------------------------------------------------------
// Format pane texts
// ---------------------------------------------------------------------------

const paneEn: PaneStrings = {
    period: "Period",
    defaultPeriod: "Default period",
    noneAllDates: "None (all dates)",
    language: "Language & date format",
    autoLanguage: "Automatic (Power BI language)",
    dateStyle: "Date style",
    dateAuto: "Automatic (long with 2 months, numeric otherwise)",
    dateShort: "Abbreviated (1 Sep 2026)",
    dateNumeric: "Numeric (01/09/2026)",
    dateLong: "Long (01 September 2026)",
    weekStart: "First day of week",
    autoWeek: "Automatic (language)",
    monday: "Monday",
    sunday: "Sunday",
    presetsCard: "Presets",
    layout: "Layout",
    mode: "Mode",
    modeCompact: "Compact bar",
    modePanel: "Panel (calendar always visible)",
    dateSelection: "Date selection",
    stackedFields: "Start / end fields (compact)",
    dialogWindow: "Power BI window (shows the range)",
    arrows: "Previous/next arrows",
    appearance: "Appearance",
    accentColor: "Accent color",
    textColor: "Text color",
    font: "Font",
    textSize: "Text size",
    cornerRadius: "Rounded corners (px)",
};

const panePtPT: PaneStrings = {
    period: "Período",
    defaultPeriod: "Período por omissão",
    noneAllDates: "Nenhum (todas as datas)",
    language: "Idioma e formato das datas",
    autoLanguage: "Automático (idioma do Power BI)",
    dateStyle: "Estilo das datas",
    dateAuto: "Automático (por extenso com 2 meses, numérico nos restantes)",
    dateShort: "Abreviado (1 set. 2026)",
    dateNumeric: "Numérico (01/09/2026)",
    dateLong: "Por extenso (01 de setembro de 2026)",
    weekStart: "Primeiro dia da semana",
    autoWeek: "Automático (idioma)",
    monday: "Segunda-feira",
    sunday: "Domingo",
    presetsCard: "Períodos visíveis",
    layout: "Layout",
    mode: "Modo",
    modeCompact: "Barra compacta",
    modePanel: "Painel (calendário sempre visível)",
    dateSelection: "Escolha de datas",
    stackedFields: "Campos de início / fim (compacto)",
    dialogWindow: "Janela do Power BI (mostra o intervalo)",
    arrows: "Setas anterior/seguinte",
    appearance: "Aparência",
    accentColor: "Cor de destaque",
    textColor: "Cor do texto",
    font: "Tipo de letra",
    textSize: "Tamanho do texto",
    cornerRadius: "Cantos arredondados (px)",
};

const panePtBR: PaneStrings = {
    ...panePtPT,
    defaultPeriod: "Período padrão",
    language: "Idioma e formato de data",
    dateStyle: "Estilo de data",
    dateShort: "Abreviado (1 de set. de 2026)",
    dateSelection: "Seleção de datas",
    arrows: "Setas anterior/próximo",
    font: "Fonte",
    dateAuto: "Automático (por extenso com 2 meses, numérico nos demais)",
};

const paneEs: PaneStrings = {
    period: "Período",
    defaultPeriod: "Período predeterminado",
    noneAllDates: "Ninguno (todas las fechas)",
    language: "Idioma y formato de fecha",
    autoLanguage: "Automático (idioma de Power BI)",
    dateStyle: "Estilo de fecha",
    dateAuto: "Automático (completo con 2 meses, numérico en los demás)",
    dateShort: "Abreviado (1 sept 2026)",
    dateNumeric: "Numérico (01/09/2026)",
    dateLong: "Completo (01 de septiembre de 2026)",
    weekStart: "Primer día de la semana",
    autoWeek: "Automático (idioma)",
    monday: "Lunes",
    sunday: "Domingo",
    presetsCard: "Períodos visibles",
    layout: "Diseño",
    mode: "Modo",
    modeCompact: "Barra compacta",
    modePanel: "Panel (calendario siempre visible)",
    dateSelection: "Selección de fechas",
    stackedFields: "Campos de inicio / fin (compacto)",
    dialogWindow: "Ventana de Power BI (muestra el intervalo)",
    arrows: "Flechas anterior/siguiente",
    appearance: "Apariencia",
    accentColor: "Color de énfasis",
    textColor: "Color del texto",
    font: "Fuente",
    textSize: "Tamaño del texto",
    cornerRadius: "Esquinas redondeadas (px)",
};

const paneFr: PaneStrings = {
    period: "Période",
    defaultPeriod: "Période par défaut",
    noneAllDates: "Aucune (toutes les dates)",
    language: "Langue et format de date",
    autoLanguage: "Automatique (langue de Power BI)",
    dateStyle: "Style de date",
    dateAuto: "Automatique (complet avec 2 mois, numérique sinon)",
    dateShort: "Abrégé (1 sept. 2026)",
    dateNumeric: "Numérique (01/09/2026)",
    dateLong: "Complet (01 septembre 2026)",
    weekStart: "Premier jour de la semaine",
    autoWeek: "Automatique (langue)",
    monday: "Lundi",
    sunday: "Dimanche",
    presetsCard: "Périodes visibles",
    layout: "Disposition",
    mode: "Mode",
    modeCompact: "Barre compacte",
    modePanel: "Panneau (calendrier toujours visible)",
    dateSelection: "Sélection des dates",
    stackedFields: "Champs début / fin (compact)",
    dialogWindow: "Fenêtre Power BI (affiche la plage)",
    arrows: "Flèches précédent/suivant",
    appearance: "Apparence",
    accentColor: "Couleur d'accentuation",
    textColor: "Couleur du texte",
    font: "Police",
    textSize: "Taille du texte",
    cornerRadius: "Coins arrondis (px)",
};

const paneDe: PaneStrings = {
    period: "Zeitraum",
    defaultPeriod: "Standardzeitraum",
    noneAllDates: "Keiner (gesamter Zeitraum)",
    language: "Sprache und Datumsformat",
    autoLanguage: "Automatisch (Power BI-Sprache)",
    dateStyle: "Datumsstil",
    dateAuto: "Automatisch (ausgeschrieben bei 2 Monaten, sonst numerisch)",
    dateShort: "Abgekürzt (1. Sept. 2026)",
    dateNumeric: "Numerisch (01.09.2026)",
    dateLong: "Ausgeschrieben (01. September 2026)",
    weekStart: "Erster Wochentag",
    autoWeek: "Automatisch (Sprache)",
    monday: "Montag",
    sunday: "Sonntag",
    presetsCard: "Sichtbare Zeiträume",
    layout: "Layout",
    mode: "Modus",
    modeCompact: "Kompakte Leiste",
    modePanel: "Panel (Kalender immer sichtbar)",
    dateSelection: "Datumsauswahl",
    stackedFields: "Start-/Endfelder (kompakt)",
    dialogWindow: "Power BI-Fenster (zeigt den Bereich)",
    arrows: "Pfeile zurück/vor",
    appearance: "Darstellung",
    accentColor: "Akzentfarbe",
    textColor: "Textfarbe",
    font: "Schriftart",
    textSize: "Textgröße",
    cornerRadius: "Abgerundete Ecken (px)",
};

const paneIt: PaneStrings = {
    period: "Periodo",
    defaultPeriod: "Periodo predefinito",
    noneAllDates: "Nessuno (tutte le date)",
    language: "Lingua e formato data",
    autoLanguage: "Automatico (lingua di Power BI)",
    dateStyle: "Stile data",
    dateAuto: "Automatico (esteso con 2 mesi, numerico negli altri casi)",
    dateShort: "Abbreviato (1 set 2026)",
    dateNumeric: "Numerico (01/09/2026)",
    dateLong: "Esteso (01 settembre 2026)",
    weekStart: "Primo giorno della settimana",
    autoWeek: "Automatico (lingua)",
    monday: "Lunedì",
    sunday: "Domenica",
    presetsCard: "Periodi visibili",
    layout: "Layout",
    mode: "Modalità",
    modeCompact: "Barra compatta",
    modePanel: "Pannello (calendario sempre visibile)",
    dateSelection: "Selezione date",
    stackedFields: "Campi inizio / fine (compatto)",
    dialogWindow: "Finestra di Power BI (mostra l'intervallo)",
    arrows: "Frecce precedente/successivo",
    appearance: "Aspetto",
    accentColor: "Colore principale",
    textColor: "Colore testo",
    font: "Carattere",
    textSize: "Dimensione testo",
    cornerRadius: "Angoli arrotondati (px)",
};

const paneZh: PaneStrings = {
    period: "时间段",
    defaultPeriod: "默认时间段",
    noneAllDates: "无（所有日期）",
    language: "语言和日期格式",
    autoLanguage: "自动（Power BI 语言）",
    dateStyle: "日期样式",
    dateAuto: "自动（显示 2 个月时为完整格式，否则为数字）",
    dateShort: "缩写（2026年9月1日）",
    dateNumeric: "数字（2026/09/01）",
    dateLong: "完整（2026年9月1日）",
    weekStart: "每周第一天",
    autoWeek: "自动（按语言）",
    monday: "星期一",
    sunday: "星期日",
    presetsCard: "显示的快速选项",
    layout: "布局",
    mode: "模式",
    modeCompact: "紧凑栏",
    modePanel: "面板（始终显示日历）",
    dateSelection: "日期选择",
    stackedFields: "开始/结束字段（紧凑）",
    dialogWindow: "Power BI 窗口（显示范围）",
    arrows: "上一个/下一个箭头",
    appearance: "外观",
    accentColor: "强调色",
    textColor: "文本颜色",
    font: "字体",
    textSize: "文本大小",
    cornerRadius: "圆角 (px)",
};

const paneJa: PaneStrings = {
    period: "期間",
    defaultPeriod: "既定の期間",
    noneAllDates: "なし (すべての日付)",
    language: "言語と日付形式",
    autoLanguage: "自動 (Power BI の言語)",
    dateStyle: "日付のスタイル",
    dateAuto: "自動 (2 か月表示時は完全形式、それ以外は数値)",
    dateShort: "省略形 (2026年9月1日)",
    dateNumeric: "数値 (2026/09/01)",
    dateLong: "完全形式 (2026年9月1日)",
    weekStart: "週の最初の曜日",
    autoWeek: "自動 (言語)",
    monday: "月曜日",
    sunday: "日曜日",
    presetsCard: "表示する期間",
    layout: "レイアウト",
    mode: "モード",
    modeCompact: "コンパクト バー",
    modePanel: "パネル (カレンダーを常に表示)",
    dateSelection: "日付の選択",
    stackedFields: "開始/終了フィールド (コンパクト)",
    dialogWindow: "Power BI ウィンドウ (範囲を表示)",
    arrows: "前へ/次へ矢印",
    appearance: "外観",
    accentColor: "アクセント カラー",
    textColor: "テキストの色",
    font: "フォント",
    textSize: "テキスト サイズ",
    cornerRadius: "角の丸み (px)",
};

export const STRINGS: Record<LanguageKey, Strings> = { en, ptPT, ptBR, es, fr, de, it, zh, ja };
export const PANE_STRINGS: Record<LanguageKey, PaneStrings> = {
    en: paneEn, ptPT: panePtPT, ptBR: panePtBR, es: paneEs, fr: paneFr, de: paneDe, it: paneIt, zh: paneZh, ja: paneJa,
};

/**
 * Language options of the "Language & date format" setting, written in their own
 * language so authors recognise them whatever the Power BI UI language is.
 */
export const LANGUAGE_OPTIONS: { value: string; displayName: string }[] = [
    { value: "pt-PT", displayName: "Português (Portugal)" },
    { value: "pt-BR", displayName: "Português (Brasil)" },
    { value: "en-GB", displayName: "English (UK)" },
    { value: "en-US", displayName: "English (US)" },
    { value: "es-ES", displayName: "Español" },
    { value: "fr-FR", displayName: "Français" },
    { value: "de-DE", displayName: "Deutsch" },
    { value: "it-IT", displayName: "Italiano" },
    { value: "zh-CN", displayName: "中文(简体)" },
    { value: "ja-JP", displayName: "日本語" },
];
