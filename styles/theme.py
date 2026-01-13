"""
Custom CSS theme for the Transaction Reconciliation Tool.
Inspired by modern Google/Canva design principles.
"""

def get_global_css() -> str:
    """Return the global CSS styles to be injected into the Streamlit app."""
    return """
<style>
    /* ===== GLOBAL RESET & BASE STYLES ===== */
    .stApp {
        background: #f8f9fa;
    }
    
    .main .block-container {
        padding-top: 1rem;
        padding-bottom: 2rem;
        max-width: 100%;
    }
    
    /* Hide default Streamlit header */
    header[data-testid="stHeader"] {
        background: transparent;
    }
    
    /* ===== TYPOGRAPHY ===== */
    h1, h2, h3, h4, h5, h6 {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
        color: #202124;
    }
    
    /* ===== APP HEADER ===== */
    .app-header {
        background: white;
        border-bottom: 1px solid #dadce0;
        padding: 16px 24px;
        margin: -1rem -1rem 1rem -1rem;
    }
    
    .app-title {
        font-size: 22px;
        font-weight: 500;
        margin: 0 0 4px 0;
        color: #202124;
    }
    
    .app-subtitle {
        font-size: 13px;
        color: #5f6368;
        margin: 0;
    }
    
    /* ===== TOOLBAR ===== */
    .toolbar {
        background: white;
        border-bottom: 1px solid #dadce0;
        padding: 10px 20px;
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        align-items: center;
        margin: 0 -1rem 1rem -1rem;
    }
    
    .toolbar-btn {
        background: white;
        border: 1px solid #dadce0;
        border-radius: 4px;
        padding: 8px 16px;
        font-size: 13px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: #202124;
        transition: all 0.2s;
        text-decoration: none;
    }
    
    .toolbar-btn:hover {
        background: #f8f9fa;
        border-color: #bdc1c6;
    }
    
    .toolbar-btn.primary {
        background: #1a73e8;
        color: white;
        border-color: #1a73e8;
    }
    
    .toolbar-btn.primary:hover {
        background: #1765cc;
    }
    
    .toolbar-btn.success {
        background: #34a853;
        color: white;
        border-color: #34a853;
    }
    
    .toolbar-btn.success:hover {
        background: #2d9148;
    }
    
    .toolbar-btn.danger {
        background: #ea4335;
        color: white;
        border-color: #ea4335;
    }
    
    .toolbar-btn.danger:hover {
        background: #d33426;
    }
    
    /* ===== CARDS & SECTIONS ===== */
    .card {
        background: white;
        border: 1px solid #dadce0;
        border-radius: 8px;
        padding: 24px;
        margin-bottom: 16px;
    }
    
    .card-header {
        padding: 16px 20px;
        background: #f8f9fa;
        border-bottom: 1px solid #dadce0;
        border-radius: 8px 8px 0 0;
        margin: -24px -24px 16px -24px;
    }
    
    .section-title {
        font-size: 16px;
        font-weight: 500;
        margin: 0 0 16px 0;
        color: #202124;
    }
    
    /* ===== UPLOAD AREA ===== */
    .upload-area {
        border: 2px dashed #dadce0;
        border-radius: 8px;
        padding: 40px 32px;
        text-align: center;
        transition: all 0.2s;
        background: white;
    }
    
    .upload-area:hover {
        border-color: #1a73e8;
        background: #f8f9fa;
    }
    
    .upload-area.has-file {
        border-style: solid;
        border-color: #34a853;
        background: #e6f4ea;
    }
    
    .upload-icon {
        font-size: 48px;
        margin-bottom: 12px;
    }
    
    /* ===== WORKFLOW FLOWCHART ===== */
    .workflow-container {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 24px;
        padding: 40px 20px;
        flex-wrap: wrap;
    }
    
    .flow-step {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        background: #f8f9fa;
        border: 2px solid #e8eaed;
        border-radius: 12px;
        padding: 28px 24px;
        min-width: 160px;
        position: relative;
        transition: all 0.2s;
    }
    
    .flow-step:hover {
        border-color: #1a73e8;
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(26, 115, 232, 0.15);
    }
    
    .flow-step.active {
        border-color: #1a73e8;
        background: #e8f0fe;
    }
    
    .flow-step.completed {
        border-color: #34a853;
        background: #e6f4ea;
    }
    
    .flow-icon {
        font-size: 48px;
        margin-bottom: 4px;
    }
    
    .flow-number {
        position: absolute;
        top: -14px;
        left: -14px;
        width: 32px;
        height: 32px;
        background: #1a73e8;
        color: white;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        font-size: 15px;
        box-shadow: 0 2px 8px rgba(26,115,232,0.3);
    }
    
    .flow-number.completed {
        background: #34a853;
    }
    
    .flow-title {
        font-size: 15px;
        font-weight: 500;
        margin: 0;
        color: #202124;
    }
    
    .flow-arrow {
        font-size: 32px;
        color: #5f6368;
        opacity: 0.5;
    }
    
    /* ===== TABLES ===== */
    .styled-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
        background: white;
    }
    
    .styled-table thead {
        position: sticky;
        top: 0;
        background: white;
        z-index: 1;
    }
    
    .styled-table th {
        text-align: left;
        padding: 10px 14px;
        border-bottom: 2px solid #dadce0;
        font-weight: 500;
        font-size: 11px;
        color: #5f6368;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        white-space: nowrap;
    }
    
    .styled-table td {
        padding: 10px 14px;
        border-bottom: 1px solid #f1f3f4;
    }
    
    .styled-table tbody tr:hover td {
        background: #f8f9fa;
    }
    
    /* ===== PANES CONTAINER (3-COLUMN LAYOUT) ===== */
    .panes-container {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 1px;
        background: #dadce0;
        border-radius: 8px;
        overflow: hidden;
        min-height: 400px;
    }
    
    .pane {
        background: white;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }
    
    .pane-header {
        padding: 14px 18px;
        border-bottom: 1px solid #dadce0;
        background: #f8f9fa;
        font-weight: 500;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-shrink: 0;
    }
    
    .pane-title {
        font-size: 14px;
        color: #202124;
    }
    
    .pane-count {
        background: #e8eaed;
        padding: 3px 10px;
        border-radius: 12px;
        font-size: 12px;
        color: #5f6368;
    }
    
    .pane-content {
        flex: 1;
        overflow-y: auto;
        padding: 0;
    }
    
    /* ===== STATUS BADGES ===== */
    .status-badge {
        display: inline-block;
        padding: 3px 10px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 500;
    }
    
    .status-unmatched {
        background: #fce8e6;
        color: #c5221f;
    }
    
    .status-suggested {
        background: #fef7e0;
        color: #f9ab00;
    }
    
    .status-matched {
        background: #e6f4ea;
        color: #137333;
    }
    
    .status-duplicate {
        background: #e8eaed;
        color: #5f6368;
    }
    
    /* ===== CONFIDENCE BADGES ===== */
    .confidence-badge {
        padding: 4px 12px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 500;
    }
    
    .confidence-high {
        background: #e6f4ea;
        color: #137333;
    }
    
    .confidence-medium {
        background: #fef7e0;
        color: #f9ab00;
    }
    
    .confidence-low {
        background: #fce8e6;
        color: #c5221f;
    }
    
    /* ===== COMPARISON GRID ===== */
    .comparison-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 24px;
    }
    
    .comparison-side {
        background: #f8f9fa;
        border-radius: 8px;
        padding: 20px;
    }
    
    .comparison-title {
        font-size: 14px;
        font-weight: 500;
        margin: 0 0 16px 0;
        color: #5f6368;
    }
    
    .field-row {
        display: flex;
        justify-content: space-between;
        padding: 10px 12px;
        border-bottom: 1px solid #e8eaed;
        border-radius: 4px;
        margin-bottom: 2px;
    }
    
    .field-row:last-child {
        border-bottom: none;
    }
    
    .field-label {
        font-size: 12px;
        color: #5f6368;
        font-weight: 500;
    }
    
    .field-value {
        font-size: 12px;
        color: #202124;
        font-weight: 500;
    }
    
    .field-match {
        background: #e6f4ea;
    }
    
    .field-mismatch {
        background: #fce8e6;
    }
    
    /* ===== MATCH EXPLANATION ===== */
    .match-explanation {
        background: white;
        border: 1px solid #dadce0;
        border-radius: 8px;
        padding: 16px 20px;
        margin-top: 20px;
    }
    
    .explanation-title {
        font-size: 14px;
        font-weight: 500;
        margin: 0 0 12px 0;
        color: #202124;
    }
    
    .explanation-list {
        list-style: none;
        padding: 0;
        margin: 0;
    }
    
    .explanation-list li {
        font-size: 13px;
        color: #5f6368;
        padding: 6px 0 6px 24px;
        position: relative;
    }
    
    .explanation-list li:before {
        content: "✓";
        position: absolute;
        left: 4px;
        color: #34a853;
        font-weight: bold;
    }
    
    /* ===== RULES PANEL ===== */
    .rules-panel {
        background: white;
        border: 1px solid #dadce0;
        border-radius: 8px;
        padding: 20px 24px;
        margin-top: 16px;
    }
    
    .rules-title {
        font-size: 12px;
        font-weight: 600;
        margin: 0 0 16px 0;
        color: #5f6368;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    
    .rules-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 20px;
    }
    
    .rule-item {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    
    .rule-label {
        font-size: 13px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        color: #202124;
    }
    
    /* ===== STAT CARDS ===== */
    .stat-card {
        text-align: center;
        padding: 24px 20px;
        background: #f8f9fa;
        border-radius: 8px;
        border: 1px solid #e8eaed;
    }
    
    .stat-value {
        font-size: 36px;
        font-weight: 500;
        margin: 0 0 6px 0;
        color: #202124;
    }
    
    .stat-value.success {
        color: #137333;
    }
    
    .stat-value.warning {
        color: #f9ab00;
    }
    
    .stat-value.danger {
        color: #c5221f;
    }
    
    .stat-label {
        font-size: 13px;
        color: #5f6368;
        margin: 0;
    }
    
    /* ===== EXPORT OPTIONS ===== */
    .export-option {
        padding: 20px;
        border: 1px solid #dadce0;
        border-radius: 8px;
        margin-bottom: 12px;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: white;
    }
    
    .export-option:hover {
        border-color: #1a73e8;
        background: #f8f9fa;
        transform: translateX(4px);
    }
    
    .export-option h3 {
        margin: 0 0 4px 0;
        font-size: 15px;
        font-weight: 500;
        color: #202124;
    }
    
    .export-option p {
        margin: 0;
        font-size: 13px;
        color: #5f6368;
    }
    
    /* ===== EXCEPTION GROUP ===== */
    .exception-group {
        background: white;
        border: 1px solid #dadce0;
        border-radius: 8px;
        margin-bottom: 20px;
        overflow: hidden;
    }
    
    .exception-header {
        padding: 16px 20px;
        background: #f8f9fa;
        border-bottom: 1px solid #dadce0;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    
    .exception-title {
        font-size: 15px;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 10px;
        color: #202124;
    }
    
    .exception-count {
        background: #fce8e6;
        color: #c5221f;
        padding: 3px 10px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 500;
    }
    
    /* ===== COLUMN MAPPING GRID ===== */
    .column-mapping {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 16px;
        margin-top: 16px;
    }
    
    .mapping-field {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    
    .mapping-label {
        font-size: 12px;
        font-weight: 500;
        color: #5f6368;
    }
    
    /* ===== EMPTY STATE ===== */
    .empty-state {
        text-align: center;
        padding: 60px 20px;
        color: #5f6368;
    }
    
    .empty-icon {
        font-size: 64px;
        margin-bottom: 16px;
        opacity: 0.5;
    }
    
    .empty-text {
        font-size: 14px;
        color: #5f6368;
    }
    
    /* ===== AUDIT TRAIL ===== */
    .audit-entry {
        padding: 14px 16px;
        background: #f8f9fa;
        border-radius: 8px;
        margin-bottom: 12px;
        font-size: 13px;
        border-left: 3px solid #1a73e8;
    }
    
    .audit-timestamp {
        color: #5f6368;
        font-size: 11px;
        margin-bottom: 4px;
    }
    
    .audit-action {
        font-weight: 500;
        margin-bottom: 4px;
        color: #202124;
    }
    
    .audit-details {
        color: #5f6368;
    }
    
    /* ===== LOADING SPINNER ===== */
    .loading-spinner {
        width: 48px;
        height: 48px;
        border: 4px solid #e8eaed;
        border-top-color: #1a73e8;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin: 40px auto;
    }
    
    @keyframes spin {
        to { transform: rotate(360deg); }
    }
    
    /* ===== SIDEBAR STYLING ===== */
    [data-testid="stSidebar"] {
        background: white;
        border-right: 1px solid #dadce0;
    }
    
    [data-testid="stSidebar"] .block-container {
        padding-top: 1rem;
    }
    
    /* ===== BUTTON OVERRIDES FOR STREAMLIT ===== */
    .stButton > button {
        border-radius: 4px;
        font-weight: 500;
        transition: all 0.2s;
    }
    
    .stButton > button:hover {
        border-color: #bdc1c6;
    }
    
    /* Primary button styling */
    .stButton > button[kind="primary"] {
        background: #1a73e8;
        color: white;
        border: none;
    }
    
    .stButton > button[kind="primary"]:hover {
        background: #1765cc;
    }
    
    /* ===== STREAMLIT DATAFRAME STYLING ===== */
    [data-testid="stDataFrame"] {
        border: 1px solid #dadce0;
        border-radius: 8px;
        overflow: hidden;
    }
    
    /* ===== FILE UPLOADER STYLING ===== */
    [data-testid="stFileUploader"] {
        border: 2px dashed #dadce0;
        border-radius: 8px;
        padding: 20px;
        transition: all 0.2s;
    }
    
    [data-testid="stFileUploader"]:hover {
        border-color: #1a73e8;
        background: #f8f9fa;
    }
    
    /* ===== EXPANDER STYLING ===== */
    .streamlit-expanderHeader {
        background: #f8f9fa;
        border-radius: 8px;
        font-weight: 500;
    }
    
    /* ===== METRIC STYLING ===== */
    [data-testid="stMetric"] {
        background: #f8f9fa;
        padding: 16px;
        border-radius: 8px;
        border: 1px solid #e8eaed;
    }
    
    /* ===== PROGRESS BAR ===== */
    .stProgress > div > div {
        background: #1a73e8;
    }
    
    /* ===== TOAST/NOTIFICATION ===== */
    .toast {
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        background: #202124;
        color: white;
        padding: 12px 24px;
        border-radius: 4px;
        font-size: 13px;
        z-index: 3000;
        box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    }
    
    /* ===== RESPONSIVE ADJUSTMENTS ===== */
    @media (max-width: 768px) {
        .panes-container {
            grid-template-columns: 1fr;
        }
        
        .comparison-grid {
            grid-template-columns: 1fr;
        }
        
        .workflow-container {
            flex-direction: column;
        }
        
        .flow-arrow {
            transform: rotate(90deg);
        }
    }
</style>
"""


def get_header_html(title: str = "MatchingAI", subtitle: str = "Semi-automatic matching for company ledgers and bank transactions") -> str:
    """Return the HTML for the app header."""
    return f"""
<div class="app-header">
    <h1 class="app-title">{title}</h1>
    <p class="app-subtitle">{subtitle}</p>
</div>
"""


def get_workflow_step_html(number: int, icon: str, title: str, is_active: bool = False, is_completed: bool = False) -> str:
    """Return HTML for a single workflow step in the flowchart."""
    step_class = "flow-step"
    number_class = "flow-number"
    
    if is_completed:
        step_class += " completed"
        number_class += " completed"
        number_display = "✓"
    else:
        number_display = str(number)
    
    if is_active:
        step_class += " active"
    
    return f"""
<div class="{step_class}">
    <div class="{number_class}">{number_display}</div>
    <div class="flow-icon">{icon}</div>
    <h3 class="flow-title">{title}</h3>
</div>
"""


def get_flow_arrow_html() -> str:
    """Return HTML for flow arrow between steps."""
    return '<div class="flow-arrow">→</div>'


def get_card_html(content: str, title: str = None) -> str:
    """Wrap content in a styled card."""
    header = f'<div class="card-header"><h3 class="section-title">{title}</h3></div>' if title else ''
    return f"""
<div class="card">
    {header}
    {content}
</div>
"""


def get_stat_card_html(value: str, label: str, color_class: str = "") -> str:
    """Return HTML for a stat card."""
    value_class = f"stat-value {color_class}" if color_class else "stat-value"
    return f"""
<div class="stat-card">
    <p class="{value_class}">{value}</p>
    <p class="stat-label">{label}</p>
</div>
"""


def get_status_badge_html(status: str) -> str:
    """Return HTML for a status badge."""
    status_lower = status.lower()
    css_class = f"status-{status_lower}" if status_lower in ['unmatched', 'suggested', 'matched', 'duplicate'] else 'status-unmatched'
    return f'<span class="status-badge {css_class}">{status}</span>'


def get_confidence_badge_html(confidence: str) -> str:
    """Return HTML for a confidence badge."""
    confidence_lower = confidence.lower()
    css_class = f"confidence-{confidence_lower}" if confidence_lower in ['high', 'medium', 'low'] else 'confidence-medium'
    return f'<span class="confidence-badge {css_class}">{confidence} Confidence</span>'


def get_pane_header_html(title: str, count: int, count_label: str = "items") -> str:
    """Return HTML for a pane header."""
    return f"""
<div class="pane-header">
    <span class="pane-title">{title}</span>
    <span class="pane-count">{count} {count_label}</span>
</div>
"""


def get_empty_state_html(icon: str, text: str) -> str:
    """Return HTML for an empty state."""
    return f"""
<div class="empty-state">
    <div class="empty-icon">{icon}</div>
    <div class="empty-text">{text}</div>
</div>
"""


def get_upload_area_html(icon: str, text: str, subtext: str = "", has_file: bool = False) -> str:
    """Return HTML for an upload area."""
    area_class = "upload-area has-file" if has_file else "upload-area"
    return f"""
<div class="{area_class}">
    <div class="upload-icon">{icon}</div>
    <div><strong>{text}</strong></div>
    {f'<div style="font-size: 12px; color: #5f6368; margin-top: 6px;">{subtext}</div>' if subtext else ''}
</div>
"""


def get_field_row_html(label: str, value: str, is_match: bool = None) -> str:
    """Return HTML for a field row in comparison view."""
    row_class = "field-row"
    if is_match is True:
        row_class += " field-match"
    elif is_match is False:
        row_class += " field-mismatch"
    
    return f"""
<div class="{row_class}">
    <span class="field-label">{label}</span>
    <span class="field-value">{value}</span>
</div>
"""


def get_audit_entry_html(timestamp: str, action: str, details: str) -> str:
    """Return HTML for an audit trail entry."""
    return f"""
<div class="audit-entry">
    <div class="audit-timestamp">{timestamp}</div>
    <div class="audit-action">{action}</div>
    <div class="audit-details">{details}</div>
</div>
"""


def get_export_option_html(icon: str, title: str, description: str) -> str:
    """Return HTML for an export option card."""
    return f"""
<div class="export-option">
    <div>
        <h3>{icon} {title}</h3>
        <p>{description}</p>
    </div>
    <span style="font-size: 20px; color: #5f6368;">→</span>
</div>
"""


def get_exception_header_html(icon: str, title: str, count: int) -> str:
    """Return HTML for an exception group header."""
    return f"""
<div class="exception-header">
    <div class="exception-title">
        {icon} {title}
    </div>
    <span class="exception-count">{count}</span>
</div>
"""
