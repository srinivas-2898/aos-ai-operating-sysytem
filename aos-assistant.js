/**
 * AOS AI Assistant Client Runtime
 * Self-contained, premium voice and text assistant for the AI Operating System.
 */
(() => {
  const SUPABASE_URL = 'https://gdqapoopqijohrtovjza.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdkcWFwb29wcWlqb2hydG92anphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MjcyNzAsImV4cCI6MjEwMDUwMzI3MH0.mQsxKSmGBC3EfGLbuG2c5zAAzJKKIkq8wzsKzoO8oyI';
  
  const client = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;
  const AI_API_URL = window.AOS_AI_API_URL || '/api/chat';

  // State Management
  const STATES = {
    IDLE: 'idle',
    INITIALIZING: 'initializing',
    LISTENING: 'listening',
    THINKING: 'thinking',
    SPEAKING: 'speaking',
    EXECUTING: 'executing',
    ERROR: 'error',
    // Project-first conversation states
    AWAITING_PROJECT_CHOICE: 'awaiting_project_choice',
    AWAITING_PROJECT_SELECT: 'awaiting_project_select',
    AWAITING_PROJECT_DETAILS_SINGLE: 'awaiting_project_details_single',
    AWAITING_PROJECT_NAME: 'awaiting_project_name',
    AWAITING_PROJECT_DESC: 'awaiting_project_desc',
    AWAITING_PROJECT_LANG: 'awaiting_project_lang',
    AWAITING_PROJECT_FRAMEWORK: 'awaiting_project_framework'
  };

  let currentState = STATES.IDLE;
  let currentUser = null;
  let currentProject = null;
  let pendingAction = null;       // Stores deferred action when project is needed
  let cachedProjects = [];        // Fetched projects for voice readout
  let femaleVoice = null;         // Cached female SpeechSynthesis voice
  let assistantPrefs = {
    voice_enabled: true,
    speech_enabled: true,
    welcome_enabled: true,
    preferred_language: 'en-US'
  };

  // Speech Recognition & Synthesis Instances
  let SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let currentUtterance = null;
  let speechTimeout = null;

  // Initialize Speech Recognition if supported
  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
  }

  // Inject Styles dynamically
  const injectStyles = () => {
    const style = document.createElement('style');
    style.id = 'aos-assistant-styles';
    style.textContent = `
      :root {
        --assistant-primary: #2563eb;
        --assistant-glow: rgba(37, 99, 235, 0.45);
        --assistant-bg: rgba(255, 255, 255, 0.85);
        --assistant-border: rgba(226, 232, 240, 0.8);
        --assistant-text: #0f172a;
        --assistant-muted: #64748b;
      }
      body.dark-mode {
        --assistant-primary: #3b82f6;
        --assistant-glow: rgba(59, 130, 246, 0.45);
        --assistant-bg: rgba(15, 23, 42, 0.9);
        --assistant-border: rgba(51, 65, 85, 0.8);
        --assistant-text: #f8fafc;
        --assistant-muted: #94a3b8;
      }

      /* Floating Orb */
      #aos-assistant-orb-container {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 10000;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 12px;
        font-family: 'Inter', sans-serif;
      }
      
      .assistant-orb {
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: linear-gradient(135deg, #2563eb, #7c3aed);
        box-shadow: 0 8px 32px var(--assistant-glow), inset 0 2px 4px rgba(255,255,255,0.2);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        position: relative;
        overflow: hidden;
      }
      .assistant-orb:hover {
        transform: scale(1.08) translateY(-2px);
      }
      
      /* Orb Animations depending on state */
      .assistant-orb.state-idle::after {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: 50%;
        border: 2px solid transparent;
        background: linear-gradient(135deg, #3b82f6, #8b5cf6) border-box;
        -webkit-mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0);
        -webkit-mask-composite: destination-out;
        mask-composite: exclude;
        animation: orb-spin 8s linear infinite;
        opacity: 0.7;
      }
      .assistant-orb.state-listening {
        background: linear-gradient(135deg, #10b981, #059669);
        box-shadow: 0 0 0 10px rgba(16, 185, 129, 0.2), 0 8px 32px rgba(16, 185, 129, 0.4);
        animation: orb-pulse 1.5s ease-in-out infinite;
      }
      .assistant-orb.state-thinking {
        background: linear-gradient(135deg, #7c3aed, #ec4899);
        animation: orb-rotate 2s linear infinite;
      }
      .assistant-orb.state-speaking {
        background: linear-gradient(135deg, #3b82f6, #60a5fa);
        box-shadow: 0 0 0 8px rgba(59, 130, 246, 0.25);
        animation: orb-speak-pulse 1.2s ease-in-out infinite;
      }
      .assistant-orb.state-error {
        background: linear-gradient(135deg, #ef4444, #b91c1c);
        animation: orb-shake 0.5s ease-in-out;
      }

      .assistant-orb svg {
        width: 26px;
        height: 26px;
        fill: none;
        stroke: #ffffff;
        stroke-width: 2.2;
        stroke-linecap: round;
        stroke-linejoin: round;
        z-index: 2;
        transition: transform 0.3s;
      }

      /* Panel container */
      .assistant-panel {
        width: 360px;
        background: var(--assistant-bg);
        border: 1px solid var(--assistant-border);
        border-radius: 18px;
        box-shadow: 0 12px 40px rgba(15, 23, 42, 0.15);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        transition: all 0.3s cubic-bezier(0.165, 0.84, 0.44, 1);
        transform-origin: bottom right;
        opacity: 0;
        transform: scale(0.8) translateY(20px);
        pointer-events: none;
        max-height: 480px;
      }
      
      .assistant-panel.open {
        opacity: 1;
        transform: scale(1) translateY(0);
        pointer-events: auto;
      }

      /* Header */
      .assistant-header {
        padding: 14px 18px;
        border-bottom: 1px solid var(--assistant-border);
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .assistant-header-title {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .assistant-header-orb {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #10b981;
      }
      .assistant-header-title span {
        font-size: 14px;
        font-weight: 700;
        color: var(--assistant-text);
      }
      .assistant-header-controls {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .assistant-btn-icon {
        width: 28px;
        height: 28px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--assistant-muted);
        cursor: pointer;
        transition: background 0.2s, color 0.2s;
      }
      .assistant-btn-icon:hover {
        background: rgba(37, 99, 235, 0.1);
        color: var(--assistant-primary);
      }

      /* Body */
      .assistant-body {
        padding: 18px;
        flex: 1;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 14px;
        min-height: 200px;
      }

      /* Dialogue / Response Area */
      .assistant-dialogue {
        font-size: 14px;
        line-height: 1.55;
        color: var(--assistant-text);
        margin-bottom: auto;
      }
      .assistant-dialogue .assistant-bubble {
        background: rgba(37, 99, 235, 0.08);
        border-left: 3px solid var(--assistant-primary);
        padding: 10px 14px;
        border-radius: 0 12px 12px 12px;
        font-weight: 500;
      }
      .assistant-dialogue .user-bubble {
        align-self: flex-end;
        background: rgba(148, 163, 184, 0.15);
        padding: 8px 12px;
        border-radius: 12px 12px 0 12px;
        margin-top: 8px;
        text-align: right;
        font-style: italic;
        color: var(--assistant-muted);
      }

      /* Waveform Animation */
      .assistant-waveform {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        height: 36px;
        margin: 10px 0;
      }
      .waveform-bar {
        width: 3px;
        height: 8px;
        background-color: var(--assistant-primary);
        border-radius: 2px;
        transition: height 0.15s ease;
      }
      .state-speaking .waveform-bar {
        animation: waveform-speak-anim 1.2s ease-in-out infinite;
      }
      .state-listening .waveform-bar {
        animation: waveform-listen-anim 0.8s ease-in-out infinite;
      }
      /* Offset animation timings */
      .waveform-bar:nth-child(1) { animation-delay: 0.1s; }
      .waveform-bar:nth-child(2) { animation-delay: 0.25s; }
      .waveform-bar:nth-child(3) { animation-delay: 0.4s; }
      .waveform-bar:nth-child(4) { animation-delay: 0.15s; }
      .waveform-bar:nth-child(5) { animation-delay: 0.3s; }
      .waveform-bar:nth-child(6) { animation-delay: 0.5s; }
      .waveform-bar:nth-child(7) { animation-delay: 0.2s; }

      /* Action Status */
      .assistant-status {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--assistant-muted);
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .assistant-status .status-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background-color: #cbd5e1;
      }
      .state-listening .assistant-status .status-dot { background-color: #10b981; }
      .state-thinking .assistant-status .status-dot { background-color: #7c3aed; }
      .state-speaking .assistant-status .status-dot { background-color: #2563eb; }

      /* Footer / Text Input Fallback */
      .assistant-footer {
        padding: 12px 18px 18px;
        border-top: 1px solid var(--assistant-border);
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .assistant-input-wrap {
        position: relative;
        flex: 1;
      }
      .assistant-input-wrap input {
        width: 100%;
        height: 38px;
        border: 1.5px solid var(--assistant-border);
        border-radius: 10px;
        padding: 0 40px 0 14px;
        font-size: 13.5px;
        outline: none;
        background: rgba(148, 163, 184, 0.05);
        color: var(--assistant-text);
        box-sizing: border-box;
        transition: border-color 0.2s, background 0.2s;
      }
      .assistant-input-wrap input:focus {
        border-color: var(--assistant-primary);
        background: transparent;
      }
      .assistant-input-send {
        position: absolute;
        right: 8px;
        top: 50%;
        transform: translateY(-50%);
        width: 26px;
        height: 26px;
        border-radius: 6px;
        color: var(--assistant-muted);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .assistant-input-send:hover {
        color: var(--assistant-primary);
      }

      /* Animations Keyframes */
      @keyframes orb-spin {
        100% { transform: rotate(360deg); }
      }
      @keyframes orb-pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.06); }
      }
      @keyframes orb-rotate {
        0% { transform: rotate(0deg) scale(1); }
        50% { transform: rotate(180deg) scale(1.05); }
        100% { transform: rotate(360deg) scale(1); }
      }
      @keyframes orb-speak-pulse {
        0%, 100% { transform: scale(1); box-shadow: 0 0 0 6px rgba(59, 130, 246, 0.2); }
        50% { transform: scale(1.04); box-shadow: 0 0 0 14px rgba(59, 130, 246, 0.15); }
      }
      @keyframes orb-shake {
        0%, 100% { transform: translateX(0); }
        20%, 60% { transform: translateX(-6px); }
        40%, 80% { transform: translateX(6px); }
      }
      @keyframes waveform-speak-anim {
        0%, 100% { height: 8px; }
        50% { height: 28px; }
      }
      @keyframes waveform-listen-anim {
        0%, 100% { height: 8px; }
        50% { height: 20px; }
      }

      /* Mobile Support overrides */
      @media (max-width: 768px) {
        #aos-assistant-orb-container {
          right: 16px;
          bottom: 84px; /* avoid bottom nav overlap */
        }
        .assistant-panel {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          width: 100%;
          border-radius: 20px 20px 0 0;
          border-bottom: none;
          max-height: 80vh;
          transform-origin: bottom center;
          transform: translateY(100%);
        }
        .assistant-panel.open {
          transform: translateY(0);
        }
      }
    `;
    document.head.appendChild(style);
  };

  // HTML Template
  const createAssistantMarkup = () => {
    const container = document.createElement('div');
    container.id = 'aos-assistant-orb-container';
    container.innerHTML = `
      <!-- Panel (floating card) -->
      <div class="assistant-panel" id="aos-assistant-panel">
        <div class="assistant-header">
          <div class="assistant-header-title">
            <div class="assistant-header-orb" id="aos-assistant-indicator"></div>
            <span>AOS Assistant</span>
          </div>
          <div class="assistant-header-controls">
            <!-- Stop Speaking -->
            <button class="assistant-btn-icon" id="aos-assistant-stop" title="Stop speaking" style="display:none;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"/></svg>
            </button>
            <!-- Mute / Unmute Toggle -->
            <button class="assistant-btn-icon" id="aos-assistant-mute" title="Mute speech output">
              <svg id="aos-mute-icon-on" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
              <svg id="aos-mute-icon-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none;"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
            </button>
            <!-- Minimize -->
            <button class="assistant-btn-icon" id="aos-assistant-close" title="Minimize">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        <div class="assistant-body">
          <div class="assistant-dialogue" id="aos-assistant-dialogue">
            <div class="assistant-bubble">I'm initializing. Ready in a moment.</div>
          </div>
          
          <!-- Visual waveform bars -->
          <div class="assistant-waveform" id="aos-assistant-waveform">
            <div class="waveform-bar"></div>
            <div class="waveform-bar"></div>
            <div class="waveform-bar"></div>
            <div class="waveform-bar"></div>
            <div class="waveform-bar"></div>
            <div class="waveform-bar"></div>
            <div class="waveform-bar"></div>
          </div>

          <div class="assistant-status" id="aos-assistant-status">
            <div class="status-dot"></div>
            <span id="aos-status-text">AOS System Online</span>
          </div>
        </div>

        <div class="assistant-footer">
          <div class="assistant-input-wrap">
            <input type="text" id="aos-assistant-text-input" placeholder="Type here or ask aloud..." />
            <button class="assistant-input-send" id="aos-assistant-send-btn" title="Send message">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
        </div>
      </div>

      <!-- Main Orb Button -->
      <div class="assistant-orb state-idle" id="aos-assistant-orb" title="Talk to AOS AI Assistant">
        <svg id="orb-mic-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
      </div>
    `;
    document.body.appendChild(container);
  };

  // UI State Modifiers
  const setUiState = (state, customStatus = '') => {
    currentState = state;
    const orb = document.getElementById('aos-assistant-orb');
    const panel = document.getElementById('aos-assistant-panel');
    const indicator = document.getElementById('aos-assistant-indicator');
    const statusText = document.getElementById('aos-status-text');
    const waveform = document.getElementById('aos-assistant-waveform');
    const stopBtn = document.getElementById('aos-assistant-stop');

    if (!orb) return;

    // Reset state classes
    orb.className = 'assistant-orb';
    orb.classList.add(`state-${state}`);
    panel.className = 'assistant-panel';
    if (panel.dataset.open === 'true') {
      panel.classList.add('open');
    }
    panel.classList.add(`state-${state}`);

    // Update stop speaking visibility
    if (state === STATES.SPEAKING) {
      stopBtn.style.display = 'flex';
    } else {
      stopBtn.style.display = 'none';
    }

    // Set indicator lights
    switch (state) {
      case STATES.IDLE:
        indicator.style.backgroundColor = '#64748b';
        statusText.textContent = customStatus || 'AOS AI Offline / Idle';
        break;
      case STATES.INITIALIZING:
        indicator.style.backgroundColor = '#3b82f6';
        statusText.textContent = 'Initializing Voice Engine...';
        break;
      case STATES.LISTENING:
        indicator.style.backgroundColor = '#10b981';
        statusText.textContent = 'Listening to your request...';
        break;
      case STATES.THINKING:
        indicator.style.backgroundColor = '#7c3aed';
        statusText.textContent = 'AOS Thinking...';
        break;
      case STATES.SPEAKING:
        indicator.style.backgroundColor = '#2563eb';
        statusText.textContent = 'Speaking response...';
        break;
      case STATES.EXECUTING:
        indicator.style.backgroundColor = '#f59e0b';
        statusText.textContent = 'Executing AOS Action...';
        break;
      case STATES.ERROR:
        indicator.style.backgroundColor = '#ef4444';
        statusText.textContent = customStatus || 'Assistant Error';
        break;
    }
  };

  // Supabase Data Operations
  const loadPreferences = async (userId) => {
    try {
      const { data: { session } } = await client.auth.getSession();
      const token = session ? session.access_token : '';

      const response = await fetch(getBackendUrl('/api/assistant/preferences'), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) throw new Error(`Preferences GET failed: ${response.status}`);
      
      const data = await response.json();
      if (data) {
        assistantPrefs = data;
        syncPreferencesToSettingsUi();
      }
    } catch (err) {
      console.error('Failed to load assistant preferences from backend:', err);
    }
  };

  const savePreferences = async () => {
    if (!currentUser) return;
    try {
      const { data: { session } } = await client.auth.getSession();
      const token = session ? session.access_token : '';

      const response = await fetch(getBackendUrl('/api/assistant/preferences'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          voice_enabled: assistantPrefs.voice_enabled,
          speech_enabled: assistantPrefs.speech_enabled,
          welcome_enabled: assistantPrefs.welcome_enabled,
          preferred_language: assistantPrefs.preferred_language
        })
      });

      if (!response.ok) throw new Error(`Preferences PUT failed: ${response.status}`);
      
      const data = await response.json();
      assistantPrefs = data;
      window.showToast?.('Assistant preferences saved successfully!');
    } catch (err) {
      console.error('Failed to save preferences to backend:', err);
      window.showToast?.('Could not save assistant preferences.');
    }
  };

  const logConversation = async (userMessage, assistantResponse, intent = 'general', action = 'none') => {
    if (!client || !currentUser) return;
    try {
      const projectParams = new URLSearchParams(window.location.search);
      const projectId = projectParams.get('project_id');

      await client.from('assistant_conversations').insert({
        user_id: currentUser.id,
        project_id: projectId || null,
        user_message: userMessage,
        assistant_response: assistantResponse,
        intent: intent,
        action: action
      });
    } catch (err) {
      console.error('Failed to log conversation details:', err);
    }
  };

  // Voice Input Flow
  const startListening = () => {
    if (!recognition) {
      addDialogueLine("Speech recognition is not supported in this browser. Please use the text input below.", "assistant");
      setUiState(STATES.ERROR, 'Speech Recognition Unavailable');
      return;
    }

    if (currentState === STATES.LISTENING) {
      recognition.stop();
      return;
    }

    // Cancel current speech synthesis if speaking
    stopSpeaking();

    recognition.lang = assistantPrefs.preferred_language || 'en-US';
    
    recognition.onstart = () => {
      setUiState(STATES.LISTENING);
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      setUiState(STATES.ERROR, `Error: ${event.error}`);
    };

    recognition.onend = () => {
      if (currentState === STATES.LISTENING) {
        setUiState(STATES.IDLE, 'Microphone standby');
      }
    };

    recognition.onresult = (event) => {
      const speechToText = event.results[0][0].transcript;
      addDialogueLine(speechToText, 'user');
      handleUserInput(speechToText);
    };

    try {
      recognition.start();
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      setUiState(STATES.ERROR, 'Mic initialization failed');
    }
  };

  // Voice Output Flow
  const resolveFemaleVoice = () => {
    if (femaleVoice) return femaleVoice;
    const voices = window.speechSynthesis.getVoices();
    // Priority list of known female voice names across browsers
    const femaleKeywords = ['female', 'zira', 'samantha', 'karen', 'moira', 'tessa', 'fiona', 'victoria', 'google uk english female', 'google us english', 'microsoft zira'];
    for (const kw of femaleKeywords) {
      const match = voices.find(v => v.name.toLowerCase().includes(kw));
      if (match) { femaleVoice = match; return match; }
    }
    // Fallback: pick any English voice
    const englishVoice = voices.find(v => v.lang.startsWith('en'));
    if (englishVoice) { femaleVoice = englishVoice; return englishVoice; }
    return voices[0] || null;
  };

  const speakWithFemaleVoice = (text, onEndCallback = null) => {
    if (!window.speechSynthesis) return;
    stopSpeaking();
    
    const cleanText = text.replace(/```[\s\S]*?```/g, '').trim().slice(0, 500);
    currentUtterance = new SpeechSynthesisUtterance(cleanText);
    currentUtterance.lang = 'en-US';
    
    const voice = resolveFemaleVoice();
    if (voice) currentUtterance.voice = voice;
    currentUtterance.rate = 0.95;
    currentUtterance.pitch = 1.1;

    currentUtterance.onstart = () => {
      setUiState(STATES.SPEAKING);
    };
    currentUtterance.onend = () => {
      currentUtterance = null;
      if (onEndCallback) onEndCallback();
      else setUiState(STATES.IDLE, 'AOS System Standby');
    };
    currentUtterance.onerror = () => {
      currentUtterance = null;
      if (onEndCallback) onEndCallback();
    };
    window.speechSynthesis.speak(currentUtterance);
  };

  const speakText = (text, stateAfter = null) => {
    if (!assistantPrefs.speech_enabled || !window.speechSynthesis) return;

    stopSpeaking();

    // Limit text size for synthesis read-aloud to avoid API crashes or locks
    const cleanText = text.replace(/```[\s\S]*?```/g, '[Code snippet omitted from audio]').trim().slice(0, 400);

    currentUtterance = new SpeechSynthesisUtterance(cleanText);
    currentUtterance.lang = assistantPrefs.preferred_language || 'en-US';

    // Use female voice by default
    const voice = resolveFemaleVoice();
    if (voice) currentUtterance.voice = voice;
    currentUtterance.rate = 0.95;
    currentUtterance.pitch = 1.05;

    currentUtterance.onstart = () => {
      setUiState(STATES.SPEAKING);
    };

    currentUtterance.onend = () => {
      currentUtterance = null;
      if (stateAfter) {
        // Preserve conversation state (e.g. AWAITING_PROJECT_CHOICE) 
        setUiState(stateAfter.state, stateAfter.status || 'AOS System Standby');
        // Auto-start listening for voice response in conversation flows
        if (assistantPrefs.voice_enabled && stateAfter.autoListen) {
          setTimeout(() => startListening(), 300);
        }
      } else if (currentState === STATES.SPEAKING) {
        setUiState(STATES.IDLE, 'AOS System Standby');
      }
    };

    currentUtterance.onerror = (e) => {
      console.error('SpeechSynthesis error:', e);
      setUiState(STATES.IDLE, 'AOS System Standby');
      currentUtterance = null;
    };

    window.speechSynthesis.speak(currentUtterance);
  };

  const stopSpeaking = () => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (currentUtterance) {
      currentUtterance = null;
    }
    if (currentState === STATES.SPEAKING) {
      setUiState(STATES.IDLE, 'Speech cancelled');
    }
  };

  // Helper to construct fully qualified backend path (reused pattern)
  const getBackendUrl = (path) => {
    const base = AI_API_URL.replace(/\/api\/chat(?:\?.*)?$/, '');
    return `${base}${path}`;
  };

  // ══════════════════════════════════════════════════════════════════
  // Conversation State Machine — handles multi-step project flows
  // ══════════════════════════════════════════════════════════════════

  const CONVERSATION_STATES = [
    STATES.AWAITING_PROJECT_CHOICE,
    STATES.AWAITING_PROJECT_SELECT,
    STATES.AWAITING_PROJECT_DETAILS_SINGLE,
    STATES.AWAITING_PROJECT_NAME,
    STATES.AWAITING_PROJECT_DESC,
    STATES.AWAITING_PROJECT_LANG,
    STATES.AWAITING_PROJECT_FRAMEWORK
  ];

  const isConversationState = () => CONVERSATION_STATES.includes(currentState);

  const handleUserInput = (text) => {
    const lower = text.toLowerCase().trim();

    // Route through conversation state machine if in a project flow
    if (currentState === STATES.AWAITING_PROJECT_CHOICE) {
      return handleProjectChoice(lower);
    }
    if (currentState === STATES.AWAITING_PROJECT_SELECT) {
      return handleProjectSelect(lower);
    }
    if (currentState === STATES.AWAITING_PROJECT_DETAILS_SINGLE) {
      return processAssistantRequest(text);
    }
    if (currentState === STATES.AWAITING_PROJECT_NAME) {
      return handleProjectFormName(text);
    }
    if (currentState === STATES.AWAITING_PROJECT_DESC) {
      return handleProjectFormDesc(text);
    }
    if (currentState === STATES.AWAITING_PROJECT_LANG) {
      return handleProjectFormLang(text);
    }
    if (currentState === STATES.AWAITING_PROJECT_FRAMEWORK) {
      return handleProjectFormFramework(text);
    }

    // Default: send to AI backend
    processAssistantRequest(text);
  };

  // ── Step 1: "existing" or "create new" ──
  const handleProjectChoice = (lower) => {
    if (lower.includes('existing') || lower.includes('open') || lower.includes('my project') || lower.includes('list') || lower.includes('select')) {
      fetchAndReadProjects();
    } else if (lower.includes('create') || lower.includes('new') || lower.includes('start')) {
      startVoiceProjectCreation();
    } else {
      const msg = "Say 'existing projects' to choose one, or 'create new' to start a new project.";
      addDialogueLine(msg, 'assistant');
      speakText(msg, { state: STATES.AWAITING_PROJECT_CHOICE, status: 'Awaiting your choice', autoListen: true });
    }
  };

  // ── Fetch & read out projects ──
  const fetchAndReadProjects = async () => {
    setUiState(STATES.THINKING);
    try {
      const { data: { session } } = await client.auth.getSession();
      const token = session ? session.access_token : '';
      
      const response = await fetch(getBackendUrl('/api/assistant/projects'), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) throw new Error('Failed to fetch projects');
      const result = await response.json();
      cachedProjects = result.projects || [];

      if (cachedProjects.length === 0) {
        const msg = "You don't have any projects yet. Let me help you create one.";
        addDialogueLine(msg, 'assistant');
        speakText(msg, { state: STATES.IDLE, status: 'No projects found' });
        setTimeout(() => startVoiceProjectCreation(), 2500);
        return;
      }

      // Display the projects modal visually on screen
      if (typeof window.showExistingProjects === 'function') {
        window.showExistingProjects();
      } else if (typeof window.showProjectSelectModal === 'function') {
        window.showProjectSelectModal();
      }

      // Build readout string
      const projectList = cachedProjects.map((p, i) => `${i + 1}: ${p.name}`).join('. ');
      const readout = `You have ${cachedProjects.length} project${cachedProjects.length > 1 ? 's' : ''}. ${projectList}. Say the project name or number to select it.`;
      
      addDialogueLine(readout, 'assistant');
      speakText(readout, { state: STATES.AWAITING_PROJECT_SELECT, status: 'Say project name or number', autoListen: true });

    } catch (err) {
      console.error('Failed to fetch projects:', err);
      addDialogueLine('Could not load your projects. Try again.', 'assistant');
      setUiState(STATES.ERROR, 'Project fetch failed');
    }
  };

  // ── Step 2: Match spoken project name or number ──
  const handleProjectSelect = (lower) => {
    if (lower.includes('cancel') || lower.includes('never mind') || lower.includes('back')) {
      pendingAction = null;
      addDialogueLine('Selection cancelled.', 'assistant');
      speakText('Cancelled.');
      return;
    }

    // Try number match first
    const numMatch = lower.match(/\b(\d+)\b/);
    if (numMatch) {
      const idx = parseInt(numMatch[1]) - 1;
      if (idx >= 0 && idx < cachedProjects.length) {
        selectProjectAndResume(cachedProjects[idx]);
        return;
      }
    }

    // Fuzzy name match — find best matching project
    let bestMatch = null;
    let bestScore = 0;
    for (const p of cachedProjects) {
      const name = p.name.toLowerCase();
      // Check direct inclusion
      if (lower.includes(name) || name.includes(lower)) {
        selectProjectAndResume(p);
        return;
      }
      // Word overlap scoring
      const words = lower.split(/\s+/);
      const nameWords = name.split(/\s+/);
      let score = 0;
      for (const w of words) {
        if (w.length < 2) continue;
        for (const nw of nameWords) {
          if (nw.includes(w) || w.includes(nw)) score++;
        }
      }
      if (score > bestScore) { bestScore = score; bestMatch = p; }
    }

    if (bestMatch && bestScore >= 1) {
      selectProjectAndResume(bestMatch);
      return;
    }

    const msg = "I didn't find that project. Please say the project name or number again.";
    addDialogueLine(msg, 'assistant');
    speakText(msg, { state: STATES.AWAITING_PROJECT_SELECT, status: 'Say project name again', autoListen: true });
  };

  const selectProjectAndResume = (project) => {
    const msg = `Opening project: ${project.name}.`;
    addDialogueLine(msg, 'assistant');
    speakText(msg);
    
    // Navigate to the project — if there's a pending action, include it
    setTimeout(() => {
      if (pendingAction) {
        const actionType = pendingAction.type;
        pendingAction = null;
        
        // Map action type to target page
        const pageMap = {
          'OPEN_CHAT': 'chat.html',
          'NEW_CHAT': 'chat.html',
          'OPEN_GENERATION_STUDIO': 'generation.html',
          'GENERATE_UI': 'generation.html',
          'GENERATE_IMAGE': 'generation.html',
          'GENERATE_VIDEO': 'generation.html',
          'GENERATE_PDF': 'generation.html',
          'GENERATE_DOCUMENT': 'generation.html',
          'GENERATE_PPT': 'generation.html',
          'OPEN_DEVELOPMENT_STUDIO': 'ide.html'
        };
        
        const page = pageMap[actionType] || 'chat.html';
        window.location.href = `${page}?project_id=${project.id}`;
      } else {
        window.location.href = `chat.html?project_id=${project.id}`;
      }
    }, 1500);
  };

  // ── Voice-driven project creation ──
  const startVoiceProjectCreation = () => {
    // Open the create project modal if it exists
    if (typeof window.openCreateProject === 'function') {
      window.openCreateProject();
    }

    const msg = "Please describe the project you want to create, including its name, and I will fill the details for you.";
    addDialogueLine(msg, 'assistant');
    speakText(msg, { state: STATES.AWAITING_PROJECT_DETAILS_SINGLE, status: 'Describe your project', autoListen: true });
  };

  const handleProjectFormName = (text) => {
    const nameInput = document.getElementById('project-name');
    if (nameInput) {
      nameInput.value = text.trim();
      nameInput.style.transition = 'box-shadow 0.3s';
      nameInput.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.4)';
      setTimeout(() => nameInput.style.boxShadow = '', 1500);
    }
    const msg = `Project name set to "${text.trim()}". Now describe what this project is about.`;
    addDialogueLine(msg, 'assistant');
    speakText(msg, { state: STATES.AWAITING_PROJECT_DESC, status: 'Describe your project', autoListen: true });
  };

  const handleProjectFormDesc = (text) => {
    const descInput = document.getElementById('project-description');
    if (descInput) {
      descInput.value = text.trim();
      descInput.style.transition = 'box-shadow 0.3s';
      descInput.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.4)';
      setTimeout(() => descInput.style.boxShadow = '', 1500);
    }
    const msg = "Got it. What programming language will you use? For example, Python, JavaScript, or TypeScript.";
    addDialogueLine(msg, 'assistant');
    speakText(msg, { state: STATES.AWAITING_PROJECT_LANG, status: 'Say programming language', autoListen: true });
  };

  const handleProjectFormLang = (text) => {
    const langInput = document.getElementById('project-language');
    if (langInput) {
      langInput.value = text.trim();
      langInput.style.transition = 'box-shadow 0.3s';
      langInput.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.4)';
      setTimeout(() => langInput.style.boxShadow = '', 1500);
    }
    const msg = "And what framework? For example, React, Next.js, FastAPI, or Flask. Say 'none' if you don't need one.";
    addDialogueLine(msg, 'assistant');
    speakText(msg, { state: STATES.AWAITING_PROJECT_FRAMEWORK, status: 'Say framework', autoListen: true });
  };

  const handleProjectFormFramework = (text) => {
    const fwInput = document.getElementById('project-framework');
    const value = text.toLowerCase().includes('none') ? '' : text.trim();
    if (fwInput) {
      fwInput.value = value;
      fwInput.style.transition = 'box-shadow 0.3s';
      fwInput.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.4)';
      setTimeout(() => fwInput.style.boxShadow = '', 1500);
    }
    
    const projectName = document.getElementById('project-name')?.value || 'your project';
    const msg = `Creating project "${projectName}" now.`;
    addDialogueLine(msg, 'assistant');
    speakText(msg);
    
    // Trigger the actual create function after a brief delay
    setTimeout(() => {
      if (typeof window.createProject === 'function') {
        window.createProject();
      }
    }, 1200);
  };

  // Process Requests via Backend Assistant API
  const processAssistantRequest = async (userPrompt) => {
    setUiState(STATES.THINKING);
    
    // Read session settings
    const projectParams = new URLSearchParams(window.location.search);
    const projectId = projectParams.get('project_id') || null;
    const chatId = projectParams.get('chat_id') || localStorage.getItem('aos_current_chat_id') || null;
    
    // Page detection
    let page = 'dashboard';
    if (window.location.pathname.includes('chat.html')) page = 'chat';
    else if (window.location.pathname.includes('ide.html')) page = 'ide';
    else if (window.location.pathname.includes('deploy.html')) page = 'deploy';
    else if (window.location.pathname.includes('generation.html')) page = 'generation';
    else {
      // Check query view parameter (for mode-selection subviews)
      const currentView = projectParams.get('view');
      if (currentView) page = currentView;
    }

    try {
      const { data: { session } } = await client.auth.getSession();
      const token = session ? session.access_token : '';

      const response = await fetch(getBackendUrl('/api/assistant/message'), {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          message: userPrompt,
          project_id: projectId,
          chat_id: chatId,
          page: page
        })
      });

      if (!response.ok) {
        let serverError = `Status ${response.status}`;
        try {
          const errBody = await response.json();
          serverError = errBody.error || errBody.detail || serverError;
        } catch (_) {}
        throw new Error(serverError);
      }
      
      const data = await response.json();
      const assistantReply = data.reply || "AOS Assistant is online.";

      // Handle project_required — intercept before executing action
      if (data.action && data.action.project_required) {
        pendingAction = data.action;
        addDialogueLine(assistantReply, 'assistant');
        speakText(assistantReply, { state: STATES.AWAITING_PROJECT_CHOICE, status: 'Select or create project', autoListen: true });
        await logConversation(userPrompt, assistantReply, data.intent, 'project_required');
        return;
      }

      // Handle LIST_PROJECTS intent
      if (data.intent === 'LIST_PROJECTS' || (data.action && data.action.type === 'LIST_PROJECTS')) {
        addDialogueLine(assistantReply, 'assistant');
        speakText(assistantReply);
        await logConversation(userPrompt, assistantReply, data.intent, 'list_projects');
        fetchAndReadProjects();
        return;
      }

      addDialogueLine(assistantReply, 'assistant');
      speakText(assistantReply);
      
      // Save logs in database
      await logConversation(userPrompt, assistantReply, data.intent, data.action ? data.action.type : 'none');

      if (data.action) {
        handleAssistantAction(data.action, token);
      } else {
        setUiState(STATES.IDLE, 'AOS System Standby');
      }

    } catch (err) {
      console.error('AOS Assistant Core request failed:', err);
      const fallbackMsg = `Assistant error: ${err.message || 'Connection failed'}. Try again.`;
      addDialogueLine(fallbackMsg, 'assistant');
      speakText("An error occurred. Check the details in the panel.");
      setUiState(STATES.ERROR, err.message || 'Request Failed');
      await logConversation(userPrompt, fallbackMsg, 'error', 'failed');
    }
  };

  // Action Dispatcher
  const handleAssistantAction = (action, token) => {
    if (action.requires_confirmation) {
      promptConfirmation(action, token);
      return;
    }
    
    executeAction(action, token);
  };

  // Display Confirmation Buttons inside the dialogue pane
  const promptConfirmation = (action, token) => {
    setUiState(STATES.IDLE, 'Confirmation Required');
    
    const dialog = document.getElementById('aos-assistant-dialogue');
    if (!dialog) return;

    const confirmBox = document.createElement('div');
    confirmBox.className = 'assistant-bubble';
    confirmBox.style.cssText = 'background: rgba(245, 158, 11, 0.1); border-left: 3px solid #f59e0b; padding: 12px; margin-top: 10px; border-radius: 8px;';
    confirmBox.innerHTML = `
      <div style="font-weight: 700; color: #d97706; margin-bottom: 8px;">Action Confirmation Required</div>
      <div style="font-size: 13px; margin-bottom: 12px;">This is a potentially disruptive or dangerous action. Confirm to proceed?</div>
      <div style="display: flex; gap: 8px;">
        <button id="aos-confirm-yes" class="btn-primary" style="padding: 6px 12px; font-size: 12px; border-radius: 6px; background: #d97706;">Confirm Action</button>
        <button id="aos-confirm-no" class="btn-secondary" style="padding: 6px 12px; font-size: 12px; border-radius: 6px;">Cancel</button>
      </div>
    `;
    dialog.appendChild(confirmBox);
    dialog.parentElement.scrollTop = dialog.parentElement.scrollHeight;

    // Listeners
    document.getElementById('aos-confirm-yes').addEventListener('click', () => {
      confirmBox.remove();
      executeAction(action, token);
    });

    document.getElementById('aos-confirm-no').addEventListener('click', () => {
      confirmBox.remove();
      addDialogueLine("Action cancelled by user.", 'assistant');
      speakText("Action cancelled.");
      setUiState(STATES.IDLE, 'Action Cancelled');
    });
  };

  // Perform Action
  const executeAction = async (action, token) => {
    const projectId = action.project_id || new URLSearchParams(window.location.search).get('project_id');

    // Check if the action requires a project and we don't have one selected
    const PROJECT_SCOPED_ACTIONS = [
      'OPEN_CHAT', 'NEW_CHAT', 'OPEN_GENERATION_STUDIO', 'OPEN_DEVELOPMENT_STUDIO',
      'GENERATE_UI', 'GENERATE_IMAGE', 'GENERATE_VIDEO', 'GENERATE_PDF',
      'GENERATE_DOCUMENT', 'GENERATE_PPT', 'RUN_CODE', 'CREATE_FILE',
      'EDIT_FILE', 'BUILD_PROJECT', 'OPEN_PROJECT'
    ];

    if (PROJECT_SCOPED_ACTIONS.includes(action.type) && !projectId) {
      pendingAction = action;
      const gateMsg = "Please select an existing project or create a new project.";
      addDialogueLine(gateMsg, 'assistant');
      speakText(gateMsg, { state: STATES.AWAITING_PROJECT_CHOICE, status: 'Select or create project', autoListen: true });
      return;
    }

    setUiState(STATES.EXECUTING);
    const projectQuery = projectId ? `?project_id=${projectId}` : '';

    switch (action.type) {
      // 1. Navigation / View Switching
      case 'OPEN_PROJECT':
        addDialogueLine("Opening your project workspace now.", 'assistant');
        setTimeout(() => {
          window.location.href = `chat.html?project_id=${action.project_id}`;
        }, 1200);
        break;

      case 'OPEN_CHAT':
        window.location.href = `chat.html${projectQuery}`;
        break;

      case 'NEW_CHAT':
        window.location.href = `chat.html${projectQuery}&new=true`;
        break;

      case 'OPEN_GENERATION_STUDIO':
        window.location.href = `generation.html${projectQuery}`;
        break;

      case 'OPEN_DEVELOPMENT_STUDIO':
        window.location.href = `ide.html${projectQuery}`;
        break;

      case 'OPEN_DEPLOYMENT_STUDIO':
      case 'SHOW_DEPLOYMENTS':
        window.location.href = `deploy.html${projectQuery}`;
        break;

      case 'OPEN_SETTINGS':
        const isDashboard = window.location.pathname.includes('mode-selection.html');
        if (isDashboard) {
          window.switchView?.('settings');
          setUiState(STATES.IDLE, 'Settings Opened');
        } else {
          window.location.href = 'mode-selection.html?view=settings';
        }
        break;

      case 'OPEN_GITHUB':
        window.location.href = `mode-selection.html?view=settings#github`;
        break;

      // 2. Auto-Generators Integration
      case 'GENERATE_UI':
      case 'GENERATE_IMAGE':
      case 'GENERATE_VIDEO':
      case 'GENERATE_PDF':
      case 'GENERATE_DOCUMENT':
      case 'GENERATE_PPT':
        const promptText = action.payload.prompt || "Auto-generation request";
        sessionStorage.setItem('aos_auto_prompt', promptText);
        
        let hash = 'ui-screens';
        if (action.type === 'GENERATE_IMAGE') hash = 'images';
        else if (action.type === 'GENERATE_VIDEO') hash = 'videos';
        else if (action.type === 'GENERATE_PDF' || action.type === 'GENERATE_DOCUMENT') hash = 'documents';
        else if (action.type === 'GENERATE_PPT') hash = 'presentations';

        addDialogueLine(`Forwarding prompt to the Generator module on the #${hash} panel.`, 'assistant');
        setTimeout(() => {
          window.location.href = `generation.html?project_id=${projectId}&auto=true#${hash}`;
        }, 1200);
        break;

      // 3. Backend-Executed database updates
      case 'CREATE_PROJECT':
        const nameInput = document.getElementById('project-name');
        if (nameInput) {
          const descInput = document.getElementById('project-description');
          const langInput = document.getElementById('project-language');
          const fwInput = document.getElementById('project-framework');

          nameInput.value = action.payload.name || '';
          if (descInput) descInput.value = action.payload.description || '';
          if (langInput) langInput.value = action.payload.language || '';
          if (fwInput) fwInput.value = action.payload.framework || '';

          // Highlights
          [nameInput, descInput, langInput, fwInput].forEach(inp => {
            if (inp) {
              inp.style.transition = 'all 0.4s ease';
              inp.style.boxShadow = '0 0 0 4px rgba(16, 185, 129, 0.4)';
              inp.style.borderColor = '#10b981';
            }
          });

          const confirmMsg = `Creating project "${action.payload.name}" now.`;
          addDialogueLine(confirmMsg, 'assistant');
          speakText(confirmMsg);

          setTimeout(() => {
            [nameInput, descInput, langInput, fwInput].forEach(inp => {
              if (inp) {
                inp.style.boxShadow = '';
                inp.style.borderColor = '';
              }
            });
            if (typeof window.createProject === 'function') {
              window.createProject();
            }
          }, 1500);
        } else {
          try {
            const response = await fetch(getBackendUrl('/api/assistant/action'), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                action_type: 'CREATE_PROJECT',
                payload: action.payload
              })
            });

            if (!response.ok) throw new Error("Backend creation rejected.");
            
            const result = await response.json();
            addDialogueLine(`Successfully created new project workspace: ${result.project.name}. Navigating there now.`, 'assistant');
            speakText(`Created project ${result.project.name}.`);
            
            setTimeout(() => {
              window.location.href = `chat.html?project_id=${result.project.id}`;
            }, 1500);

          } catch (err) {
            console.error("Action error:", err);
            addDialogueLine("I was unable to create the project workspace due to a database exception.", 'assistant');
            setUiState(STATES.ERROR, 'Database Action Failed');
          }
        }
        break;

      case 'DELETE_PROJECT':
        try {
          const response = await fetch(getBackendUrl('/api/assistant/action'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              action_type: 'DELETE_PROJECT',
              project_id: action.project_id || projectId
            })
          });

          if (!response.ok) throw new Error("Backend deletion rejected.");
          
          addDialogueLine("Project workspace deleted successfully.", 'assistant');
          speakText("Project deleted.");
          
          setTimeout(() => {
            window.location.href = 'mode-selection.html';
          }, 1500);

        } catch (err) {
          console.error("Action error:", err);
          addDialogueLine("I was unable to delete the project due to an authorization or database failure.", 'assistant');
          setUiState(STATES.ERROR, 'Deletion Failed');
        }
        break;

      default:
        console.warn("Unhandled action type:", action.type);
        addDialogueLine("Command recognized, but no client-side handler exists for this action yet.", 'assistant');
        setUiState(STATES.IDLE, 'Command Unhandled');
        break;
    }
  };

  // Add line to dialog UI box
  const addDialogueLine = (text, sender) => {
    const dialog = document.getElementById('aos-assistant-dialogue');
    if (!dialog) return;

    // Clear loading/welcome message if first actual conversation line
    if (dialog.innerHTML.includes('I\'m initializing') || dialog.innerHTML.includes('Welcome to AOS')) {
      dialog.innerHTML = '';
    }

    const bubble = document.createElement('div');
    bubble.className = sender === 'user' ? 'user-bubble' : 'assistant-bubble';
    bubble.textContent = text;
    dialog.appendChild(bubble);

    // Auto scroll to bottom
    dialog.parentElement.scrollTop = dialog.parentElement.scrollHeight;
  };

  // UI Event Bindings
  const setupUiListeners = () => {
    const orb = document.getElementById('aos-assistant-orb');
    const panel = document.getElementById('aos-assistant-panel');
    const closeBtn = document.getElementById('aos-assistant-close');
    const stopBtn = document.getElementById('aos-assistant-stop');
    const muteBtn = document.getElementById('aos-assistant-mute');
    const textInput = document.getElementById('aos-assistant-text-input');
    const sendBtn = document.getElementById('aos-assistant-send-btn');

    // Mute icon nodes
    const muteOn = document.getElementById('aos-mute-icon-on');
    const muteOff = document.getElementById('aos-mute-icon-off');

    const updateMuteButtonState = () => {
      if (assistantPrefs.speech_enabled) {
        muteOn.style.display = 'block';
        muteOff.style.display = 'none';
        muteBtn.title = "Mute speech output";
      } else {
        muteOn.style.display = 'none';
        muteOff.style.display = 'block';
        muteBtn.title = "Unmute speech output";
      }
    };

    // Toggle panel open/close
    orb.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = panel.dataset.open === 'true';
      if (!isOpen) {
        panel.dataset.open = 'true';
        panel.classList.add('open');
        // Auto trigger welcome speech/wave or standard listening on open if voice enabled
        if (assistantPrefs.voice_enabled && currentState === STATES.IDLE) {
          startListening();
        }
      } else {
        // If already open, clicking the orb acts as mic trigger
        if (assistantPrefs.voice_enabled) {
          startListening();
        }
      }
    });

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.dataset.open = 'false';
      panel.classList.remove('open');
      stopSpeaking();
    });

    stopBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      stopSpeaking();
    });

    muteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      assistantPrefs.speech_enabled = !assistantPrefs.speech_enabled;
      updateMuteButtonState();
      savePreferences();
      if (!assistantPrefs.speech_enabled) {
        stopSpeaking();
      }
    });

    // Send text input handlers
    const handleTextInputSend = () => {
      const txt = textInput.value.trim();
      if (!txt) return;
      textInput.value = '';
      addDialogueLine(txt, 'user');
      processAssistantRequest(txt);
    };

    textInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleTextInputSend();
    });

    sendBtn.addEventListener('click', handleTextInputSend);

    // Initial mute icons update
    updateMuteButtonState();
  };

  // Sync Supabase settings to settings dashboard card
  const syncPreferencesToSettingsUi = () => {
    const voiceCheck = document.getElementById('settings-assistant-voice');
    const speechCheck = document.getElementById('settings-assistant-speech');
    const welcomeCheck = document.getElementById('settings-assistant-welcome');
    const langSelect = document.getElementById('settings-assistant-lang');

    if (voiceCheck) voiceCheck.checked = assistantPrefs.voice_enabled;
    if (speechCheck) speechCheck.checked = assistantPrefs.speech_enabled;
    if (welcomeCheck) welcomeCheck.checked = assistantPrefs.welcome_enabled;
    if (langSelect) langSelect.value = assistantPrefs.preferred_language;
  };

  // Read card inputs and save back to database
  const bindSettingsCardEvents = () => {
    const saveBtn = document.getElementById('btn-save-assistant-settings');
    if (!saveBtn) return;

    saveBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const voiceCheck = document.getElementById('settings-assistant-voice');
      const speechCheck = document.getElementById('settings-assistant-speech');
      const welcomeCheck = document.getElementById('settings-assistant-welcome');
      const langSelect = document.getElementById('settings-assistant-lang');

      assistantPrefs.voice_enabled = voiceCheck.checked;
      assistantPrefs.speech_enabled = speechCheck.checked;
      assistantPrefs.welcome_enabled = welcomeCheck.checked;
      assistantPrefs.preferred_language = langSelect.value;

      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';

      await savePreferences();

      // Update mute state button icon locally in panel
      const muteOn = document.getElementById('aos-mute-icon-on');
      const muteOff = document.getElementById('aos-mute-icon-off');
      const muteBtn = document.getElementById('aos-assistant-mute');
      if (muteOn && muteOff) {
        if (assistantPrefs.speech_enabled) {
          muteOn.style.display = 'block';
          muteOff.style.display = 'none';
          muteBtn.title = "Mute speech output";
        } else {
          muteOn.style.display = 'none';
          muteOff.style.display = 'block';
          muteBtn.title = "Unmute speech output";
        }
      }

      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Assistant Preferences';
    });
  };

  // Welcome Trigger
  const handleWelcomeSpeech = async () => {
    // Check if we already greeted the user in this session (avoid repeating on refresh)
    const alreadyGreeted = sessionStorage.getItem('aos_dashboard_greeted');
    
    if (alreadyGreeted) {
      const welcomeEl = document.getElementById('aos-assistant-dialogue');
      if (welcomeEl) {
        welcomeEl.innerHTML = '<div class="assistant-bubble">AOS Assistant is online. Ready for commands.</div>';
      }
      setUiState(STATES.IDLE, 'AOS System Standby');
      return;
    }

    const greetingText = "Welcome to AOS.";
    const welcomeEl = document.getElementById('aos-assistant-dialogue');
    if (welcomeEl) {
      welcomeEl.innerHTML = `<div class="assistant-bubble">${greetingText}</div>`;
    }

    // Speak it loudly using the female voice Synthesis bypass
    speakWithFemaleVoice(greetingText, () => {
      setUiState(STATES.IDLE, 'AOS System Standby');
    });

    sessionStorage.setItem('aos_dashboard_greeted', 'true');

    // Also disable the standard database welcome preference so we don't double-trigger it elsewhere
    if (assistantPrefs.welcome_enabled) {
      assistantPrefs.welcome_enabled = false;
      if (currentUser) {
        await savePreferences();
        syncPreferencesToSettingsUi();
      }
    }
  };

  // Initialization Hook
  const init = () => {
    // 1. Inject styling & layout
    injectStyles();
    createAssistantMarkup();
    setupUiListeners();

    // 2. Setup user state tracking
    if (client) {
      client.auth.onAuthStateChange(async (event, session) => {
        if (session) {
          currentUser = session.user;
          setUiState(STATES.INITIALIZING);
          await loadPreferences(session.user.id);
          
          // Render settings integration if the user is on the settings view
          bindSettingsCardEvents();
          
          // Welcome flow trigger
          setTimeout(() => {
            handleWelcomeSpeech();
          }, 1000);
        } else {
          currentUser = null;
          setUiState(STATES.IDLE, 'Offline');
          stopSpeaking();
        }
      });
    } else {
      setUiState(STATES.ERROR, 'Supabase client error');
    }
  };

  // Start Assistant client
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
