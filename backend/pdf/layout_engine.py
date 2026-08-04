# Configuration and layout settings for dynamic template rendering.

PALETTES_CONFIG = {
    "Corporate Blue": {
        "primary": "#1e3a8a",
        "secondary": "#2563eb",
        "accent": "#3b82f6",
        "bg_accent": "#eff6ff",
        "border_color": "#dbeafe",
        "text_dark": "#1e293b",
        "text_light": "#64748b"
    },
    "Academic Blue": {
        "primary": "#0f172a",
        "secondary": "#334155",
        "accent": "#475569",
        "bg_accent": "#f8fafc",
        "border_color": "#e2e8f0",
        "text_dark": "#0f172a",
        "text_light": "#64748b"
    },
    "Sky Blue": {
        "primary": "#0369a1",
        "secondary": "#0284c7",
        "accent": "#0ea5e9",
        "bg_accent": "#f0f9ff",
        "border_color": "#e0f2fe",
        "text_dark": "#0f172a",
        "text_light": "#64748b"
    },
    "Green Business": {
        "primary": "#065f46",
        "secondary": "#047857",
        "accent": "#10b981",
        "bg_accent": "#f0fdf4",
        "border_color": "#d1fae5",
        "text_dark": "#064e3b",
        "text_light": "#64748b"
    },
    "Purple Creative": {
        "primary": "#6d28d9",
        "secondary": "#7c3aed",
        "accent": "#8b5cf6",
        "bg_accent": "#f5f3ff",
        "border_color": "#ede9fe",
        "text_dark": "#1e1b4b",
        "text_light": "#64748b"
    }
}

FONT_STYLES = {
    "modern": "'Inter', sans-serif",
    "classic": "'Merriweather', serif",
    "elegant": "'Playfair Display', serif",
    "bold": "'Poppins', sans-serif"
}

def get_theme_colors(palette_name: str) -> dict:
    """Return color hex configurations for the given palette name."""
    return PALETTES_CONFIG.get(palette_name, PALETTES_CONFIG["Corporate Blue"])

def get_font_family(font_style: str) -> str:
    """Return CSS font family stack for the chosen style."""
    return FONT_STYLES.get(font_style, FONT_STYLES["modern"])
