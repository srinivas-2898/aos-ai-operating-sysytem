UI_STYLES = """
* { margin: 0; padding: 0; box-sizing: border-box; }
body { 
  width: 390px; 
  height: 844px; 
  overflow: hidden; 
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif;
  position: relative;
}
.screen { width: 390px; height: 844px; position: relative; overflow: hidden; }
.status-bar {
  height: 44px; display: flex; align-items: center;
  justify-content: space-between; padding: 0 20px;
  font-size: 12px; font-weight: 600; color: white; z-index: 10;
}
.status-time { font-size: 15px; font-weight: 700; }
.status-icons { display: flex; gap: 6px; align-items: center; }
.nav-bar {
  position: absolute; bottom: 0; left: 0; right: 0;
  height: 83px; display: flex; align-items: flex-start;
  justify-content: space-around; padding-top: 10px;
  background: rgba(255,255,255,0.95);
  backdrop-filter: blur(20px);
  border-top: 1px solid rgba(0,0,0,0.08);
}
.nav-item {
  display: flex; flex-direction: column; align-items: center;
  gap: 4px; cursor: pointer;
}
.nav-icon { width: 26px; height: 26px; border-radius: 6px; }
.nav-label { font-size: 10px; font-weight: 500; color: #8e8e93; }
.nav-item.active .nav-label { color: var(--primary); }
.card {
  background: white; border-radius: 20px;
  padding: 20px; margin: 12px 16px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.08);
}
.btn-primary {
  width: 100%; height: 52px; border: none; border-radius: 14px;
  font-size: 16px; font-weight: 700; color: white; cursor: pointer;
  background: linear-gradient(135deg, var(--primary), var(--secondary));
  box-shadow: 0 8px 24px rgba(0,0,0,0.2);
  display: flex; align-items: center; justify-content: center;
}
.btn-secondary {
  width: 100%; height: 52px; border: 1.5px solid var(--primary);
  border-radius: 14px; font-size: 16px; font-weight: 600;
  color: var(--primary); background: transparent; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.input-field {
  width: 100%; height: 52px; border: 1.5px solid #e5e7eb;
  border-radius: 14px; padding: 0 16px; font-size: 15px;
  background: #f9fafb; color: #111827; outline: none;
  margin-bottom: 12px;
}
.avatar {
  border-radius: 50%; object-fit: cover;
  background: linear-gradient(135deg, var(--primary), var(--secondary));
  display: flex; align-items: center; justify-content: center;
  color: white; font-weight: 700;
}
.badge {
  background: var(--primary); color: white;
  border-radius: 20px; padding: 4px 10px;
  font-size: 11px; font-weight: 600;
}
.section-title {
  font-size: 20px; font-weight: 700; color: #111827;
  margin: 16px 16px 8px;
}
.subtitle {
  font-size: 14px; color: #6b7280; margin: 0 16px 12px;
  line-height: 1.5;
}
.list-item {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 16px; background: white;
  border-bottom: 1px solid #f3f4f6;
}
.chip {
  display: inline-flex; align-items: center;
  background: rgba(var(--primary-rgb), 0.1);
  color: var(--primary); border-radius: 20px;
  padding: 6px 14px; font-size: 12px; font-weight: 600;
  margin: 4px;
}
.hero-section {
  padding: 24px 20px 20px;
  background: linear-gradient(135deg, var(--primary), var(--secondary));
  color: white;
}
.hero-title { font-size: 28px; font-weight: 800; line-height: 1.2; }
.hero-subtitle { font-size: 14px; opacity: 0.85; margin-top: 6px; line-height: 1.5; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 0 16px; }
.feature-card {
  background: white; border-radius: 16px; padding: 16px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.06); text-align: center;
}
.feature-icon {
  width: 48px; height: 48px; border-radius: 14px; margin: 0 auto 10px;
  background: linear-gradient(135deg, var(--primary), var(--secondary));
  display: flex; align-items: center; justify-content: center;
  font-size: 22px;
}
.feature-title { font-size: 13px; font-weight: 600; color: #111827; }
.search-bar {
  display: flex; align-items: center; gap: 10px;
  background: white; border-radius: 14px; padding: 12px 16px;
  margin: 12px 16px; box-shadow: 0 2px 12px rgba(0,0,0,0.06);
}
.search-input {
  flex: 1; border: none; outline: none; font-size: 14px; color: #374151;
  background: transparent;
}
.map-area {
  height: 200px; border-radius: 20px; margin: 12px 16px;
  background: linear-gradient(135deg, #e0f2fe, #bae6fd);
  position: relative; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
}
.map-pin {
  width: 40px; height: 40px; border-radius: 50% 50% 50% 0;
  background: var(--primary); transform: rotate(-45deg);
  box-shadow: 0 4px 16px rgba(0,0,0,0.2);
}
.stats-row {
  display: flex; gap: 12px; margin: 0 16px 12px; overflow-x: auto;
}
.stat-card {
  min-width: 100px; background: white; border-radius: 16px;
  padding: 14px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); flex-shrink: 0;
}
.stat-value { font-size: 22px; font-weight: 800; color: var(--primary); }
.stat-label { font-size: 11px; color: #9ca3af; margin-top: 2px; }
.profile-header {
  display: flex; flex-direction: column; align-items: center;
  padding: 30px 20px 20px;
  background: linear-gradient(180deg, var(--primary) 0%, var(--secondary) 100%);
  color: white;
}
.notification-item {
  display: flex; gap: 12px; padding: 14px 16px;
  border-bottom: 1px solid #f3f4f6; background: white;
}
.notification-dot {
  width: 10px; height: 10px; border-radius: 50%;
  background: var(--primary); margin-top: 4px; flex-shrink: 0;
}
.progress-bar {
  height: 6px; background: #f3f4f6; border-radius: 3px; overflow: hidden;
}
.progress-fill {
  height: 100%; border-radius: 3px;
  background: linear-gradient(90deg, var(--primary), var(--secondary));
}
.tab-bar {
  display: flex; background: #f3f4f6; border-radius: 12px;
  margin: 0 16px 16px; padding: 4px;
}
.tab {
  flex: 1; height: 36px; border: none; border-radius: 10px;
  font-size: 13px; font-weight: 600; cursor: pointer;
  background: transparent; color: #6b7280;
}
.tab.active {
  background: white; color: var(--primary);
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}
.floating-btn {
  position: absolute; right: 20px; bottom: 100px;
  width: 56px; height: 56px; border-radius: 18px; border: none;
  background: linear-gradient(135deg, var(--primary), var(--secondary));
  color: white; font-size: 24px; cursor: pointer;
  box-shadow: 0 8px 24px rgba(0,0,0,0.2);
  display: flex; align-items: center; justify-content: center;
}
.glass-card {
  background: rgba(255,255,255,0.2);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255,255,255,0.3);
  border-radius: 20px; padding: 20px;
  margin: 12px 16px;
}
.rating-stars { color: #fbbf24; font-size: 16px; }
.image-placeholder {
  background: linear-gradient(135deg, var(--primary-light), var(--secondary-light));
  border-radius: 14px; display: flex; align-items: center;
  justify-content: center; font-size: 32px;
}
.onboarding-dots {
  display: flex; gap: 6px; justify-content: center; margin-top: 20px;
}
.dot {
  width: 8px; height: 8px; border-radius: 4px;
  background: rgba(255,255,255,0.4);
}
.dot.active { width: 24px; background: white; }
"""

APP_THEMES = {
    "navigation": {
        "primary": "#0ea5e9",
        "secondary": "#0284c7",
        "primary_light": "#e0f2fe",
        "secondary_light": "#bae6fd",
        "primary_rgb": "14,165,233",
        "bg": "#f0f9ff",
        "emoji": "🧭"
    },
    "ecommerce": {
        "primary": "#7c3aed",
        "secondary": "#6d28d9",
        "primary_light": "#ede9fe",
        "secondary_light": "#ddd6fe",
        "primary_rgb": "124,58,237",
        "bg": "#faf5ff",
        "emoji": "🛍️"
    },
    "social": {
        "primary": "#ec4899",
        "secondary": "#db2777",
        "primary_light": "#fce7f3",
        "secondary_light": "#fbcfe8",
        "primary_rgb": "236,72,153",
        "bg": "#fff1f7",
        "emoji": "💬"
    },
    "health": {
        "primary": "#10b981",
        "secondary": "#059669",
        "primary_light": "#d1fae5",
        "secondary_light": "#a7f3d0",
        "primary_rgb": "16,185,129",
        "bg": "#f0fdf4",
        "emoji": "💚"
    },
    "finance": {
        "primary": "#1e40af",
        "secondary": "#1d4ed8",
        "primary_light": "#dbeafe",
        "secondary_light": "#bfdbfe",
        "primary_rgb": "30,64,175",
        "bg": "#eff6ff",
        "emoji": "💰"
    },
    "education": {
        "primary": "#8b5cf6",
        "secondary": "#7c3aed",
        "primary_light": "#ede9fe",
        "secondary_light": "#ddd6fe",
        "primary_rgb": "139,92,246",
        "bg": "#f5f3ff",
        "emoji": "📚"
    },
    "food": {
        "primary": "#f59e0b",
        "secondary": "#d97706",
        "primary_light": "#fef3c7",
        "secondary_light": "#fde68a",
        "primary_rgb": "245,158,11",
        "bg": "#fffbeb",
        "emoji": "🍔"
    },
    "travel": {
        "primary": "#06b6d4",
        "secondary": "#0891b2",
        "primary_light": "#cffafe",
        "secondary_light": "#a5f3fc",
        "primary_rgb": "6,182,212",
        "bg": "#ecfeff",
        "emoji": "✈️"
    },
    "default": {
        "primary": "#6366f1",
        "secondary": "#4f46e5",
        "primary_light": "#e0e7ff",
        "secondary_light": "#c7d2fe",
        "primary_rgb": "99,102,241",
        "bg": "#eef2ff",
        "emoji": "📱"
    }
}

SCREEN_TEMPLATES = {
    "login": """
<div class="screen" style="background: linear-gradient(180deg, var(--primary) 0%, var(--secondary) 45%, var(--bg) 45%);">
  <div class="status-bar">
    <span class="status-time">9:41</span>
    <div class="status-icons">
      <span>●●●</span><span>WiFi</span><span>🔋</span>
    </div>
  </div>
  <div style="text-align:center;padding:30px 20px 20px;">
    <div style="width:80px;height:80px;border-radius:24px;background:rgba(255,255,255,0.2);backdrop-filter:blur(10px);margin:0 auto 16px;display:flex;align-items:center;justify-content:center;font-size:36px;border:2px solid rgba(255,255,255,0.3);">{{emoji}}</div>
    <div style="font-size:28px;font-weight:800;color:white;">{{app_name}}</div>
    <div style="font-size:14px;color:rgba(255,255,255,0.8);margin-top:6px;">{{tagline}}</div>
  </div>
  <div class="card" style="margin:0 16px;border-radius:24px;">
    <div style="font-size:22px;font-weight:700;color:#111827;margin-bottom:4px;">Welcome Back!</div>
    <div style="font-size:14px;color:#6b7280;margin-bottom:20px;">Sign in to continue</div>
    <input class="input-field" placeholder="Email address" />
    <input class="input-field" placeholder="Password" type="password" />
    <div style="text-align:right;margin-bottom:16px;">
      <span style="font-size:13px;color:var(--primary);font-weight:600;">Forgot Password?</span>
    </div>
    <button class="btn-primary">Sign In</button>
    <div style="text-align:center;margin:16px 0;color:#9ca3af;font-size:13px;">or continue with</div>
    <div style="display:flex;gap:12px;">
      <button style="flex:1;height:48px;border:1.5px solid #e5e7eb;border-radius:14px;background:white;font-size:13px;font-weight:600;color:#374151;cursor:pointer;">Google</button>
      <button style="flex:1;height:48px;border:1.5px solid #e5e7eb;border-radius:14px;background:white;font-size:13px;font-weight:600;color:#374151;cursor:pointer;">GitHub</button>
    </div>
    <div style="text-align:center;margin-top:16px;font-size:13px;color:#6b7280;">
      Don't have an account? <span style="color:var(--primary);font-weight:600;">Sign Up</span>
    </div>
  </div>
</div>
""",

    "home": """
<div class="screen" style="background:var(--bg);overflow-y:auto;">
  <div class="status-bar" style="background:var(--primary);color:white;">
    <span class="status-time">9:41</span>
    <div class="status-icons"><span>●●●</span><span>🔋</span></div>
  </div>
  <div class="hero-section">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <div>
        <div style="font-size:13px;opacity:0.8;">Good Morning 👋</div>
        <div style="font-size:22px;font-weight:800;">{{user_name}}</div>
      </div>
      <div class="avatar" style="width:44px;height:44px;background:rgba(255,255,255,0.2);border:2px solid rgba(255,255,255,0.4);font-size:18px;">U</div>
    </div>
    <div class="search-bar" style="margin:0;background:rgba(255,255,255,0.15);backdrop-filter:blur(10px);">
      <span style="font-size:16px;">🔍</span>
      <input class="search-input" placeholder="{{search_placeholder}}" style="color:white;" />
    </div>
  </div>
  <div class="stats-row" style="margin-top:16px;">
    {{stats}}
  </div>
  <div class="section-title">{{section1_title}}</div>
  <div class="grid-2">{{features}}</div>
  <div class="section-title">{{section2_title}}</div>
  {{list_items}}
  <div style="height:90px;"></div>
  <div class="nav-bar">{{nav_items}}</div>
</div>
""",

    "profile": """
<div class="screen" style="background:var(--bg);">
  <div class="status-bar" style="background:var(--primary);">
    <span class="status-time">9:41</span>
    <div class="status-icons"><span>●●●</span><span>🔋</span></div>
  </div>
  <div class="profile-header">
    <div class="avatar" style="width:88px;height:88px;font-size:36px;border:3px solid rgba(255,255,255,0.4);margin-bottom:14px;">U</div>
    <div style="font-size:22px;font-weight:800;">{{user_name}}</div>
    <div style="font-size:13px;opacity:0.8;margin-top:4px;">{{user_subtitle}}</div>
    <div style="display:flex;gap:32px;margin-top:20px;">
      {{profile_stats}}
    </div>
  </div>
  <div class="card" style="border-radius:24px;">
    {{profile_menu}}
  </div>
  <div style="height:90px;"></div>
  <div class="nav-bar">{{nav_items}}</div>
</div>
""",

    "dashboard": """
<div class="screen" style="background:var(--bg);overflow-y:auto;">
  <div class="status-bar" style="background:var(--primary);">
    <span class="status-time">9:41</span>
    <div class="status-icons"><span>●●●</span><span>🔋</span></div>
  </div>
  <div class="hero-section">
    <div style="font-size:13px;opacity:0.8;margin-bottom:4px;">{{dashboard_subtitle}}</div>
    <div class="hero-title">{{dashboard_title}}</div>
    <div style="display:flex;gap:12px;margin-top:16px;">
      <button style="flex:1;height:40px;border:none;border-radius:12px;background:rgba(255,255,255,0.2);color:white;font-size:13px;font-weight:600;cursor:pointer;backdrop-filter:blur(10px);">{{action1}}</button>
      <button style="flex:1;height:40px;border:none;border-radius:12px;background:white;color:var(--primary);font-size:13px;font-weight:600;cursor:pointer;">{{action2}}</button>
    </div>
  </div>
  <div class="section-title">Overview</div>
  <div class="grid-2">{{dashboard_cards}}</div>
  <div class="section-title">{{recent_title}}</div>
  <div class="card">{{chart_area}}</div>
  {{activity_list}}
  <div style="height:90px;"></div>
  <div class="nav-bar">{{nav_items}}</div>
</div>
""",

    "list": """
<div class="screen" style="background:var(--bg);overflow-y:auto;">
  <div class="status-bar" style="background:var(--primary);">
    <span class="status-time">9:41</span>
    <div class="status-icons"><span>●●●</span><span>🔋</span></div>
  </div>
  <div style="background:var(--primary);padding:16px 16px 20px;">
    <div style="font-size:22px;font-weight:800;color:white;margin-bottom:12px;">{{list_title}}</div>
    <div class="search-bar" style="margin:0;">
      <span>🔍</span>
      <input class="search-input" placeholder="Search..." />
    </div>
  </div>
  <div class="tab-bar" style="margin-top:16px;">{{tabs}}</div>
  <div style="background:white;border-radius:20px;margin:0 16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
    {{list_items}}
  </div>
  <div class="floating-btn">+</div>
  <div style="height:90px;"></div>
  <div class="nav-bar">{{nav_items}}</div>
</div>
""",

    "detail": """
<div class="screen" style="background:var(--bg);overflow-y:auto;">
  <div class="status-bar" style="background:transparent;position:absolute;top:0;z-index:10;">
    <span class="status-time" style="color:white;">9:41</span>
    <div class="status-icons" style="color:white;"><span>●●●</span><span>🔋</span></div>
  </div>
  <div style="height:220px;background:linear-gradient(135deg,var(--primary),var(--secondary));display:flex;align-items:center;justify-content:center;font-size:64px;position:relative;">
    {{detail_image}}
    <div style="position:absolute;bottom:16px;left:16px;right:16px;">
      <div style="font-size:24px;font-weight:800;color:white;">{{detail_title}}</div>
      <div style="font-size:13px;color:rgba(255,255,255,0.8);margin-top:4px;">{{detail_subtitle}}</div>
    </div>
  </div>
  <div class="card" style="border-radius:24px;margin-top:-20px;position:relative;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      {{detail_badges}}
    </div>
    <div style="font-size:22px;font-weight:700;color:#111827;margin-bottom:8px;">{{detail_heading}}</div>
    <div style="font-size:14px;color:#6b7280;line-height:1.6;margin-bottom:16px;">{{detail_description}}</div>
    <div class="progress-bar" style="margin-bottom:8px;"><div class="progress-fill" style="width:{{progress}}%;"></div></div>
    <div style="font-size:12px;color:#9ca3af;margin-bottom:20px;">{{progress_label}}</div>
    {{detail_info}}
    <button class="btn-primary" style="margin-top:16px;">{{cta_button}}</button>
  </div>
  <div style="height:90px;"></div>
  <div class="nav-bar">{{nav_items}}</div>
</div>
""",

    "onboarding": """
<div class="screen" style="background:linear-gradient(160deg,var(--primary) 0%,var(--secondary) 100%);">
  <div class="status-bar">
    <span class="status-time">9:41</span>
    <div class="status-icons"><span style="color:white;">Skip</span></div>
  </div>
  <div style="display:flex;flex-direction:column;align-items:center;padding:40px 24px;height:calc(100% - 44px);">
    <div style="width:200px;height:200px;border-radius:40px;background:rgba(255,255,255,0.15);backdrop-filter:blur(20px);border:2px solid rgba(255,255,255,0.3);display:flex;align-items:center;justify-content:center;font-size:80px;margin-bottom:40px;">{{onboarding_icon}}</div>
    <div style="font-size:30px;font-weight:800;color:white;text-align:center;line-height:1.2;margin-bottom:16px;">{{onboarding_title}}</div>
    <div style="font-size:15px;color:rgba(255,255,255,0.8);text-align:center;line-height:1.6;max-width:300px;">{{onboarding_description}}</div>
    <div class="onboarding-dots" style="margin-top:auto;">
      <div class="dot active"></div>
      <div class="dot"></div>
      <div class="dot"></div>
    </div>
    <button class="btn-primary" style="width:100%;margin-top:20px;background:rgba(255,255,255,0.2);backdrop-filter:blur(10px);border:2px solid rgba(255,255,255,0.4);">{{onboarding_btn}}</button>
  </div>
</div>
""",

    "map": """
<div class="screen" style="background:var(--bg);">
  <div class="status-bar" style="background:var(--primary);">
    <span class="status-time">9:41</span>
    <div class="status-icons"><span>●●●</span><span>🔋</span></div>
  </div>
  <div style="background:var(--primary);padding:12px 16px 20px;">
    <div style="font-size:18px;font-weight:700;color:white;margin-bottom:12px;">{{map_title}}</div>
    <div class="search-bar" style="margin:0;">
      <span>📍</span>
      <input class="search-input" placeholder="Search location..." />
    </div>
  </div>
  <div class="map-area" style="margin:16px;height:300px;border-radius:20px;background:linear-gradient(135deg,#bae6fd,#e0f2fe);position:relative;">
    <div style="position:absolute;inset:0;opacity:0.3;background-image:repeating-linear-gradient(0deg,rgba(0,0,0,0.1) 0px,transparent 1px,transparent 40px),repeating-linear-gradient(90deg,rgba(0,0,0,0.1) 0px,transparent 1px,transparent 40px);"></div>
    <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-70%);width:40px;height:40px;border-radius:50% 50% 50% 0;background:var(--primary);transform:translate(-50%,-70%) rotate(-45deg);box-shadow:0 4px 16px rgba(0,0,0,0.3);"></div>
    <div style="position:absolute;bottom:12px;right:12px;display:flex;flex-direction:column;gap:8px;">
      <button style="width:40px;height:40px;border-radius:12px;border:none;background:white;font-size:18px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.1);">+</button>
      <button style="width:40px;height:40px;border-radius:12px;border:none;background:white;font-size:18px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.1);">−</button>
    </div>
  </div>
  <div class="card" style="border-radius:20px;">
    <div style="font-size:16px;font-weight:700;color:#111827;margin-bottom:12px;">{{nearby_title}}</div>
    {{nearby_items}}
  </div>
  <div class="nav-bar">{{nav_items}}</div>
</div>
""",

    "settings": """
<div class="screen" style="background:var(--bg);">
  <div class="status-bar" style="background:var(--primary);">
    <span class="status-time">9:41</span>
    <div class="status-icons"><span>●●●</span><span>🔋</span></div>
  </div>
  <div style="background:var(--primary);padding:16px 16px 24px;">
    <div style="font-size:22px;font-weight:800;color:white;">Settings</div>
  </div>
  <div class="card" style="border-radius:24px;margin-top:-12px;">
    <div style="display:flex;gap:16px;align-items:center;margin-bottom:20px;padding-bottom:20px;border-bottom:1px solid #f3f4f6;">
      <div class="avatar" style="width:64px;height:64px;font-size:26px;">U</div>
      <div>
        <div style="font-size:18px;font-weight:700;color:#111827;">{{user_name}}</div>
        <div style="font-size:13px;color:#6b7280;margin-top:2px;">{{user_email}}</div>
        <span class="badge" style="margin-top:6px;display:inline-block;">Pro Member</span>
      </div>
    </div>
    {{settings_sections}}
  </div>
  <div style="height:90px;"></div>
  <div class="nav-bar">{{nav_items}}</div>
</div>
"""
}

def get_theme(app_type: str) -> dict:
    app_type_lower = app_type.lower() if app_type else ""
    for key in APP_THEMES:
        if key in app_type_lower:
            return APP_THEMES[key]
    return APP_THEMES["default"]

def get_screen_template(screen_type: str) -> str:
    screen_lower = screen_type.lower() if screen_type else ""
    if "login" in screen_lower or "signin" in screen_lower or "signup" in screen_lower or "auth" in screen_lower:
        return SCREEN_TEMPLATES["login"]
    elif "home" in screen_lower or "main" in screen_lower or "feed" in screen_lower:
        return SCREEN_TEMPLATES["home"]
    elif "profile" in screen_lower or "account" in screen_lower or "user" in screen_lower:
        return SCREEN_TEMPLATES["profile"]
    elif "dashboard" in screen_lower or "analytics" in screen_lower or "stats" in screen_lower:
        return SCREEN_TEMPLATES["dashboard"]
    elif "map" in screen_lower or "location" in screen_lower or "navigation" in screen_lower:
        return SCREEN_TEMPLATES["map"]
    elif "setting" in screen_lower or "preference" in screen_lower:
        return SCREEN_TEMPLATES["settings"]
    elif "detail" in screen_lower or "view" in screen_lower or "info" in screen_lower:
        return SCREEN_TEMPLATES["detail"]
    elif "onboard" in screen_lower or "welcome" in screen_lower or "intro" in screen_lower:
        return SCREEN_TEMPLATES["onboarding"]
    elif "list" in screen_lower or "search" in screen_lower or "browse" in screen_lower or "explore" in screen_lower:
        return SCREEN_TEMPLATES["list"]
    else:
        return SCREEN_TEMPLATES["home"]
