import os
import subprocess
import tempfile
import sys
from pathlib import Path

def render_html_to_pdf(html_content: str, title: str, category: str) -> str:
    """Render HTML content to a PDF using Puppeteer headlessly."""
    output_dir = Path("output")
    output_dir.mkdir(exist_ok=True)
    
    # Create temp files for intermediate storage
    with tempfile.NamedTemporaryFile(suffix=".html", delete=False, mode="w", encoding="utf-8") as temp_html:
        temp_html.write(html_content)
        temp_html_path = temp_html.name
        
    temp_pdf_name = f"aos_pdf_{tempfile.mktemp(dir='')}.pdf"
    output_pdf_path = str(output_dir / temp_pdf_name)
    
    try:
        # Resolve path to Node.js renderer script
        script_dir = Path(__file__).resolve().parent
        render_js_path = str(script_dir / "render.js")
        
        # Invoke subprocess to run Puppeteer in Node
        command = [
            "node",
            render_js_path,
            temp_html_path,
            output_pdf_path,
            title,
            category
        ]
        
        print(f"Executing HTML-to-PDF print command: {' '.join(command)}")
        result = subprocess.run(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=True
        )
        print(result.stdout)
        
        # Verify success
        if not os.path.exists(output_pdf_path):
            raise FileNotFoundError(f"PDF was not generated at expected path: {output_pdf_path}")
            
        return output_pdf_path
        
    except subprocess.CalledProcessError as e:
        print("Subprocess stdout:", e.stdout)
        print("Subprocess stderr:", e.stderr)
        raise RuntimeError(f"Puppeteer CLI rendering failed: {e.stderr}") from e
    finally:
        # Cleanup temp HTML file
        if os.path.exists(temp_html_path):
            os.remove(temp_html_path)
