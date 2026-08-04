from .layout_engine import get_theme_colors, get_font_family
import json
from datetime import date

def build_html_document(doc_json: dict) -> str:
    """Compile structured JSON content into a beautiful HTML document with Tailwind and Chart.js."""
    palette = get_theme_colors(doc_json.get("color_palette", "Corporate Blue"))
    font_family = get_font_family(doc_json.get("font_style", "modern"))
    
    sections_html = []
    
    # Process sections
    for index, sec in enumerate(doc_json.get("sections", [])):
        layout = sec.get("layout_type", "standard")
        heading = sec.get("heading", "")
        paragraphs = sec.get("paragraphs", [])
        
        # Section Heading
        heading_html = ""
        if heading:
            heading_html = f"""
            <h2 class="text-2xl font-bold tracking-tight mb-4 mt-8 page-break-after-avoid" style="color: {palette['primary']}; font-family: {font_family};">
                {heading}
            </h2>
            <div class="h-0.5 w-16 mb-6" style="background-color: {palette['accent']};"></div>
            """
            
        # Paragraphs HTML
        paras_html = ""
        if paragraphs:
            paras_html = "".join([f'<p class="text-gray-700 leading-relaxed mb-4 text-justify">{p}</p>' for p in paragraphs])
            
        # Bullet list items
        list_html = ""
        list_items = sec.get("list_items", []) or []
        if list_items:
            list_html = f"""
            <ul class="space-y-2.5 my-5 pl-1">
                {"".join([f'''
                <li class="flex items-start">
                    <span class="inline-block mr-3 mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style="background-color: {palette['accent']};"></span>
                    <span class="text-gray-700">{item}</span>
                </li>
                ''' for item in list_items])}
            </ul>
            """
            
        # Specific layout rendering
        component_html = ""
        
        if layout == "highlight_box":
            component_html = f"""
            <div class="p-6 my-6 border-l-4 rounded-r-xl" style="background-color: {palette['bg_accent']}; border-color: {palette['primary']};">
                {paras_html}
                {list_html}
            </div>
            """
            
        elif layout == "quote_card":
            quote_text = sec.get("quote_text", "")
            quote_author = sec.get("quote_author", "")
            component_html = f"""
            <div class="p-8 my-8 text-center rounded-2xl border relative overflow-hidden" style="background-color: {palette['bg_accent']}; border-color: {palette['border_color']};">
                <span class="absolute top-1 left-4 font-serif text-8xl opacity-10 select-none" style="color: {palette['primary']};">“</span>
                <blockquote class="italic text-lg font-medium mb-3 relative z-10" style="color: {palette['text_dark']};">
                    "{quote_text}"
                </blockquote>
                {f'<cite class="text-xs font-semibold uppercase tracking-wider block" style="color: {palette["accent"]};">— {quote_author}</cite>' if quote_author else ''}
            </div>
            """
            
        elif layout == "timeline":
            timeline_items = sec.get("timeline_items", []) or []
            if timeline_items:
                items_html = []
                for item in timeline_items:
                    items_html.append(f"""
                    <div class="relative pl-8 pb-6 last:pb-0">
                        <!-- Timeline Line -->
                        <div class="absolute left-2 top-2 bottom-0 w-0.5 bg-gray-200 last:hidden"></div>
                        <!-- Node Bullet -->
                        <div class="absolute left-0 top-1.5 w-4.5 h-4.5 rounded-full border-2 flex items-center justify-center bg-white" style="border-color: {palette['accent']};">
                            <div class="w-1.5 h-1.5 rounded-full" style="background-color: {palette['accent']};"></div>
                        </div>
                        <div class="text-xs font-bold uppercase tracking-wider mb-1" style="color: {palette['accent']};">{item.get('time', '')}</div>
                        <p class="text-sm text-gray-700">{item.get('description', '')}</p>
                    </div>
                    """)
                component_html = f"""
                <div class="my-6 pl-1">
                    {"".join(items_html)}
                </div>
                """
                
        elif layout == "table":
            headers = sec.get("table_headers", []) or []
            rows = sec.get("table_rows", []) or []
            if headers and rows:
                header_cols = "".join([f'<th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider border-b text-white" style="border-color: {palette["primary"]};">{h}</th>' for h in headers])
                row_cells = []
                for r_idx, row in enumerate(rows):
                    cells = "".join([f'<td class="px-4 py-3 text-sm text-gray-700 border-b border-gray-100">{cell}</td>' for cell in row[:len(headers)]])
                    bg_row = palette['bg_accent'] if r_idx % 2 == 0 else 'transparent'
                    row_cells.append(f'<tr style="background-color: {bg_row};">{cells}</tr>')
                component_html = f"""
                <div class="my-6 overflow-hidden rounded-xl border border-gray-200 shadow-sm">
                    <table class="min-w-full border-collapse">
                        <thead>
                            <tr style="background-color: {palette['primary']};">
                                {header_cols}
                            </tr>
                        </thead>
                        <tbody>
                            {"".join(row_cells)}
                        </tbody>
                    </table>
                </div>
                """
                
        elif layout == "code_block":
            code = sec.get("code_content", "")
            lang = sec.get("code_language", "text")
            component_html = f"""
            <div class="my-6 p-5 rounded-xl bg-gray-900 text-gray-100 font-mono text-xs overflow-x-auto shadow-inner relative border border-gray-800">
                <span class="absolute top-2 right-3 text-[10px] uppercase font-bold text-gray-500">{lang}</span>
                <pre class="mt-2"><code>{code}</code></pre>
            </div>
            """
            
        elif layout == "information_cards":
            cards = sec.get("cards", []) or []
            if cards:
                cards_html = []
                for card in cards:
                    cards_html.append(f"""
                    <div class="p-5 rounded-xl border bg-white shadow-xs" style="border-color: {palette['border_color']};">
                        <h4 class="text-base font-bold mb-2" style="color: {palette['primary']};">{card.get('title', '')}</h4>
                        <p class="text-sm text-gray-600 leading-relaxed">{card.get('content', '')}</p>
                    </div>
                    """)
                component_html = f"""
                <div class="grid grid-cols-2 gap-4 my-6">
                    {"".join(cards_html)}
                </div>
                """
                
        elif layout == "chart":
            c_type = sec.get("chart_type", "bar")
            c_title = sec.get("chart_title", "Chart Data")
            c_labels = sec.get("chart_labels", []) or []
            c_values = sec.get("chart_values", []) or []
            if c_labels and c_values:
                chart_colors = [palette['primary'], palette['accent'], palette['secondary'], '#64748b', '#94a3b8', '#cbd5e1']
                component_html = f"""
                <div class="my-8 p-6 rounded-2xl border bg-white shadow-sm flex flex-col items-center" style="border-color: {palette['border_color']};">
                    <h4 class="text-sm font-bold uppercase tracking-wider mb-4 w-full text-center" style="color: {palette['text_light']};">{c_title}</h4>
                    <div class="w-full max-w-md h-64 relative">
                        <canvas id="chart-canvas-{index}"></canvas>
                    </div>
                </div>
                <script>
                new Chart(document.getElementById('chart-canvas-{index}').getContext('2d'), {{
                    type: '{c_type}',
                    data: {{
                        labels: {json.dumps(c_labels)},
                        datasets: [{{
                            label: '{c_title}',
                            data: {json.dumps(c_values)},
                            backgroundColor: {json.dumps(chart_colors[:len(c_labels)])},
                            borderWidth: 1
                        }}]
                    }},
                    options: {{
                        responsive: true,
                        maintainAspectRatio: false,
                        animation: false,
                        plugins: {{
                            legend: {{
                                display: { 'true' if c_type == 'pie' else 'false' },
                                position: 'bottom',
                                labels: {{ font: {{ family: "{font_family}", size: 10 }} }}
                            }}
                        }},
                        scales: {{
                            y: {{
                                display: { 'false' if c_type == 'pie' else 'true' },
                                beginAtZero: true,
                                ticks: {{ font: {{ family: "{font_family}", size: 9 }} }}
                            }},
                            x: {{
                                display: { 'false' if c_type == 'pie' else 'true' },
                                ticks: {{ font: {{ family: "{font_family}", size: 9 }} }}
                            }}
                        }}
                    }}
                }});
                </script>
                """
                
        else:  # standard layout
            component_html = f"""
            <div class="my-4">
                {paras_html}
                {list_html}
            </div>
            """
            
        # Wrap each section in a container that supports clean page breaks
        sections_html.append(f"""
        <section class="section-container mb-10">
            {heading_html}
            {component_html}
        </section>
        """)

    # Table of Contents HTML
    toc_html = ""
    headings_list = [sec.get("heading") for sec in doc_json.get("sections", []) if sec.get("heading")]
    if len(headings_list) >= 4:
        toc_items = "".join([f"""
        <div class="flex items-center justify-between border-b border-gray-100 py-3 text-sm">
            <span class="font-medium text-gray-800">{h}</span>
            <span class="text-gray-400 font-mono">. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .</span>
        </div>
        """ for h in headings_list])
        toc_html = f"""
        <div class="page-break flex flex-col justify-start" style="height: 235mm; max-height: 235mm; box-sizing: border-box; overflow: hidden; padding-top: 15mm;">
            <h2 class="text-3xl font-extrabold tracking-tight mb-8" style="color: {palette['primary']}; font-family: {font_family};">
                Table of Contents
            </h2>
            <div class="h-1 w-24 mb-12" style="background-color: {palette['accent']};"></div>
            <div class="max-w-2xl w-full">
                {toc_items}
            </div>
        </div>
        """

    # References HTML
    refs_html = ""
    references = doc_json.get("references", []) or []
    if references:
        refs_items = "".join([f'<li class="text-sm text-gray-600 mb-2.5 list-decimal pl-1">{ref}</li>' for ref in references])
        refs_html = f"""
        <section class="section-container page-break mt-12 pt-8 border-t border-gray-200">
            <h2 class="text-xl font-bold mb-4" style="color: {palette['primary']}; font-family: {font_family};">References</h2>
            <ol class="pl-5 space-y-1">
                {refs_items}
            </ol>
        </section>
        """

    # Combine into full HTML source
    html_source = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{doc_json.get("title", "AOS Document")}</title>
    <!-- Tailwind CSS -->
    <script src="https://cdn.tailwindcss.com"></script>
    <!-- Fonts -->
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@500;600;700;800&family=Merriweather:ital,wght@0,300;0,400;1,300&family=Playfair+Display:ital,wght@0,600;1,400&display=swap" rel="stylesheet">
    <!-- ChartJS -->
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        html {{
            background: {palette['bg_accent']};
        }}
        body {{
            font-family: 'Inter', sans-serif;
            background: linear-gradient(135deg, {palette['bg_accent']} 0%, #ffffff 58%, {palette['border_color']} 100%);
            color: #1f2937;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }}
        
        .page-break {{
            page-break-after: always;
            break-after: page;
        }}
        
        .page-break-after-avoid {{
            page-break-after: avoid;
            break-after: avoid;
        }}
        
        @page {{
            size: A4;
            margin: 20mm 15mm 20mm 15mm;
        }}
        
        /* Layout formatting specific to target font family */
        h1, h2, h3, h4 {{
            font-family: 'Poppins', sans-serif;
        }}
    </style>
</head>
<body class="p-2 md:p-8 max-w-4xl mx-auto">

    <!-- COVER PAGE -->
    <div class="page-break relative flex flex-col justify-between p-12 rounded-3xl border shadow-sm" style="height: 235mm; max-height: 235mm; box-sizing: border-box; overflow: hidden; border-color: {palette['border_color']}; background: linear-gradient(135deg, {palette['primary']} 0%, {palette['secondary']} 55%, {palette['accent']} 150%);">
        <!-- Colored decorative corner shapes -->
        <div class="absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-10" style="background-color: {palette['primary']};"></div>
        <div class="absolute -bottom-16 -left-16 w-64 h-64 rounded-full opacity-5" style="background-color: {palette['accent']};"></div>

        <div class="flex items-center justify-between">
            <span class="text-xs font-bold uppercase tracking-widest px-3.5 py-1.5 rounded-full" style="color: {palette['primary']}; background-color: #ffffff;">{doc_json.get("category", "Document").upper()}</span>
            <div class="font-mono text-xs tracking-wider" style="color: #ffffff; opacity: .82;">AOS GENERATIVE STUDIO</div>
        </div>
        
        <div class="my-auto py-8">
            <h1 class="text-5xl font-extrabold tracking-tight mb-5 leading-tight" style="color: #ffffff; font-family: {font_family};">
                {doc_json.get("title", "AOS Document")}
            </h1>
            <p class="text-lg font-light max-w-2xl leading-relaxed" style="color: #ffffff; opacity: .9;">
                {doc_json.get("subtitle", "")}
            </p>
            <div class="h-1.5 w-24 mt-8 rounded-full" style="background-color: {palette['accent']};"></div>
        </div>
        
        <div class="flex items-end justify-between pt-6 text-sm" style="border-top: 1px solid rgba(255,255,255,.32); color: #ffffff;">
            <div>
                <span class="block text-xs uppercase tracking-wider mb-1" style="opacity: .72;">Prepared By</span>
                <span class="font-bold text-base">{doc_json.get("author", "AOS AI Document Studio")}</span>
            </div>
            <div class="text-right">
                <span class="block text-xs uppercase tracking-wider mb-1" style="opacity: .72;">Date</span>
                <span class="font-semibold">{doc_json.get("date", date.today().isoformat())}</span>
            </div>
        </div>
    </div>

    <!-- TABLE OF CONTENTS -->
    {toc_html}

    <!-- SECTIONS -->
    {"".join(sections_html)}

    <!-- REFERENCES -->
    {refs_html}

</body>
</html>
"""
    return html_source
