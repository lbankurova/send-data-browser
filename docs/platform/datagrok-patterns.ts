// =============================================================================
// DATAGROK UI PATTERNS REFERENCE
// =============================================================================
// This file is a reference guide for building Datagrok plugins.
// DO NOT implement alternative approaches — use these canonical patterns.
//
// Datagrok API has three namespaces, always imported as:
import * as grok from 'datagrok-api/grok';  // Entry point: shell, data, ML, chem, events
import * as ui from 'datagrok-api/ui';       // UI primitives: divs, dialogs, accordions, inputs
import * as DG from 'datagrok-api/dg';       // Core classes: DataFrame, Column, Viewer, JsViewer, etc.


// =============================================================================
// 1. PACKAGE BOILERPLATE
// =============================================================================
// Every Datagrok plugin starts with this. The _package object gives access
// to package resources (webRoot, files, etc.)

export const _package = new DG.Package();

// Register an application entry point:
//name: SEND Browser
//tags: app
export async function sendBrowserApp(): Promise<void> {
  // App initialization goes here
  const view = grok.shell.newView('SEND Browser');
  // ... build UI
}


// =============================================================================
// 2. DATAFRAME — Creating, Manipulating, Joining
// =============================================================================

// --- Load from CSV string ---
function loadDataFrameExample(): DG.DataFrame {
  const csv = `USUBJID,LBTESTCD,LBORRES,LBORRESU,VISITDY
001,ALT,45.2,U/L,1
001,ALT,52.1,U/L,8
002,AST,30.5,U/L,1`;
  return DG.DataFrame.fromCsv(csv);
}

// --- Create programmatically ---
function createDataFrame(): DG.DataFrame {
  const df = DG.DataFrame.create(3);  // 3 rows
  df.name = 'Lab Results';
  df.columns.addNewString('USUBJID').init((i) => ['001', '002', '003'][i]);
  df.columns.addNewFloat('LBORRES').init((i) => [45.2, 52.1, 30.5][i]);
  df.columns.addNewInt('VISITDY').init((i) => [1, 8, 15][i]);
  return df;
}

// --- Access columns and values ---
function accessData(df: DG.DataFrame): void {
  const col = df.col('LBORRES')!;          // Get column by name (returns Column | null)
  const val = col.get(0);                   // Get value at row index
  col.set(0, 99.9);                         // Set value at row index
  df.set('LBORRES', 0, 99.9);              // Alternative: set by column name

  // Iterate rows
  for (let i = 0; i < df.rowCount; i++) {
    const subjId = df.get('USUBJID', i);
    const result = df.get('LBORRES', i);
  }

  // Get column stats
  const stats = col.stats;  // has min, max, avg, stdev, missingValueCount, etc.
}

// --- Add computed/derived columns ---
function addDerivedColumns(df: DG.DataFrame): void {
  // New column with formula
  df.columns.addNewFloat('Pct_vs_Control').init((i) => {
    const value = df.get('Group_Mean', i);
    const control = df.get('Control_Mean', i);
    return control !== 0 ? ((value - control) / control) * 100 : 0;
  });

  // New categorical column
  df.columns.addNewString('Significance').init((i) => {
    const p = df.get('P_Value', i);
    return p < 0.001 ? '***' : p < 0.01 ? '**' : p < 0.05 ? '*' : 'ns';
  });
}

// --- Filter and selection (BitSet) ---
function filterAndSelect(df: DG.DataFrame): void {
  // Filter: controls which rows are visible in viewers
  df.filter.init((i) => df.get('VISITDY', i) > 1);  // Show only post-baseline

  // Selection: controls which rows are highlighted
  df.selection.init((i) => df.get('P_Value', i) < 0.05);

  // React to selection changes
  df.onSelectionChanged.subscribe(() => {
    const selectedCount = df.selection.trueCount;
    grok.shell.info(`${selectedCount} rows selected`);
  });

  // React to current row change (single row focus)
  df.onCurrentRowChanged.subscribe(() => {
    const row = df.currentRow;
    const subjId = row.get('USUBJID');
  });

  // React to filter changes
  df.onFilterChanged.subscribe(() => {
    grok.shell.info(`${df.filter.trueCount} rows visible`);
  });
}

// --- Join two DataFrames (e.g., DM + LB) ---
function joinDomains(dm: DG.DataFrame, lb: DG.DataFrame): DG.DataFrame {
  return grok.data.joinTables(dm, lb, ['USUBJID'], ['USUBJID'], dm.columns.names(), lb.columns.names(), DG.JOIN_TYPE.LEFT, false);
}


// =============================================================================
// 3. TABLE VIEW — The Central Container for Data Analysis
// =============================================================================
// TableView is the primary view for working with a dataframe.
// It provides grid, filters, viewers, toolbox, ribbon, and context panel.

function createTableView(df: DG.DataFrame): DG.TableView {
  const tv = grok.shell.addTableView(df);
  tv.name = 'Laboratory Results';
  return tv;
}


// =============================================================================
// 4. VIEWERS — Charts & Visualizations
// =============================================================================
// Viewers are data-bound visual components. All viewers sharing a view
// share the same selection and filter (linked by default).

function addViewers(tv: DG.TableView, df: DG.DataFrame): void {

  // --- Add viewers via shortcut methods (preferred for built-in types) ---
  tv.barChart({ split: 'ARM', value: 'LBORRES', valueAggrType: 'avg' });
  tv.boxPlot({ value: 'LBORRES', category: 'ARM' });
  tv.histogram({ value: 'LBORRES' });
  tv.lineChart({ x: 'VISITDY', y: 'LBORRES', split: 'ARM' });
  tv.scatterPlot({ x: 'VISITDY', y: 'LBORRES', color: 'ARM' });

  // --- Add viewers via addViewer (works for all viewer types) ---
  tv.addViewer('Histogram', { value: 'LBORRES' });
  tv.addViewer(DG.VIEWER.SCATTER_PLOT, { x: 'VISITDY', y: 'LBORRES' });

  // --- Add filters viewer ---
  tv.filters({ filters: [
    { column: 'SEX', type: DG.FILTER_TYPE.CATEGORICAL },
    { column: 'ARM', type: DG.FILTER_TYPE.CATEGORICAL },
    { column: 'VISITDY', type: DG.FILTER_TYPE.CATEGORICAL },
  ]});

  // --- Statistics viewer ---
  tv.addViewer('Statistics');

  // --- Grid (the spreadsheet) — already part of TableView ---
  const grid = tv.grid;
  grid.columns.setOrder(['USUBJID', 'LBTESTCD', 'LBORRES', 'ARM', 'VISITDY']);

  // Color-code a column
  grid.col('Significance')!.cellType = 'html';
}

// --- Create a standalone viewer (not attached to TableView) ---
function standaloneViewer(df: DG.DataFrame): DG.Viewer {
  return DG.Viewer.scatterPlot(df, { x: 'VISITDY', y: 'LBORRES', color: 'ARM' });
}


// =============================================================================
// 5. FILTERS — Standard Datagrok Filter Panel
// =============================================================================
// Filters are viewers. They dock in the standard left position.
// They automatically filter the dataframe — no custom code needed.

function setupFilters(tv: DG.TableView): void {
  // Standard approach: add filters for specific columns
  tv.filters({ filters: [
    { column: 'SEX', type: DG.FILTER_TYPE.CATEGORICAL },
    { column: 'ARMCD', type: DG.FILTER_TYPE.CATEGORICAL },
    { column: 'LBTESTCD', type: DG.FILTER_TYPE.CATEGORICAL },
  ]});

  // Or just add all auto-detected filters
  tv.filters();
}


// =============================================================================
// 6. INFO PANELS (Context Panel)
// =============================================================================
// Info panels appear in the Context Panel (right side) and update
// based on user selection. They are registered via function annotations.
//
// Key annotations:
//   //tags: panel, widgets     → Makes it an info panel
//   //input: string xxx {semType: YYY}  → Triggers on semantic type
//   //condition: ...            → When to show
//   //output: widget result    → Must return DG.Widget

// --- Info panel triggered by semantic type ---
//name: Subject Details
//tags: panel, widgets
//input: string subjectId {semType: SubjectId}
//output: widget result
//condition: true
export function subjectDetailsPanel(subjectId: string): DG.Widget {
  // This panel appears whenever user clicks a cell with semType "SubjectId"
  const container = ui.divV([
    ui.h2('Subject Details'),
    ui.divText(`Subject: ${subjectId}`),
    // Add more content dynamically...
  ]);
  return new DG.Widget(container);
}

// --- Info panel triggered by dataframe condition ---
//name: Study Summary
//tags: panel
//input: dataframe table
//condition: table.name == "DM" && table.columns.containsAll(["USUBJID", "ARM", "SEX"])
//output: widget result
export function studySummaryPanel(table: DG.DataFrame): DG.Widget {
  const nSubjects = table.col('USUBJID')!.stats.uniqueCount;
  const container = ui.divV([
    ui.h2('Study Summary'),
    ui.divText(`Subjects: ${nSubjects}`),
  ]);
  return new DG.Widget(container);
}


// =============================================================================
// 7. CUSTOM INFO PANELS — Built Programmatically (Non-Annotation)
// =============================================================================
// Sometimes you need to build context panel content dynamically
// rather than via annotations. You can update the context panel directly.

function buildContextPanelContent(df: DG.DataFrame, tv: DG.TableView): void {
  // React to current row change, then update an accordion in context panel
  df.onCurrentRowChanged.subscribe(() => {
    const row = df.currentRow;
    if (!row) return;

    const testCd = row.get('LBTESTCD');
    const result = row.get('LBORRES');
    const unit = row.get('LBORRESU');

    // Build accordion content
    const acc = ui.accordion('Finding Details');
    acc.addPane('Result', () => ui.divV([
      ui.tableFromMap({
        'Test': testCd,
        'Result': `${result} ${unit}`,
        'Visit Day': row.get('VISITDY'),
      })
    ]));
    acc.addPane('Statistics', () => {
      // Could add a mini chart or stats table here
      return ui.divText('Stats would go here');
    });

    // Place in context panel - NOTE: exact method depends on your view setup
    // This is one approach using a panel within the view
  });
}


// =============================================================================
// 8. ACCORDION — Collapsible Sections
// =============================================================================
// Used heavily in toolbox, context panel, and custom panels.

function accordionExample(): HTMLElement {
  const acc = ui.accordion('Analysis');

  // Static content
  acc.addPane('Overview', () => ui.divV([
    ui.h3('Study Overview'),
    ui.divText('12 subjects, 4 dose groups'),
  ]));

  // Dynamic / lazy-loaded content
  acc.addPane('Statistics', () => {
    const container = ui.div();
    // Content created on expand (lazy)
    container.append(ui.divText('Computing...'));
    return container;
  });

  // With expanded state
  acc.addPane('Findings', () => ui.divText('Key findings'), true); // true = expanded by default

  return acc.root;
}


// =============================================================================
// 9. TOOLBOX — Left Side Panel
// =============================================================================
// The toolbox is view-specific. Set it via view.toolbox.
// Typically contains an accordion with controls.

function setupToolbox(view: DG.ViewBase): void {
  const acc = ui.accordion('SEND Browser');

  // Study tree / navigation
  acc.addPane('Domains', () => {
    const tree = ui.tree();
    const core = tree.group('Core');
    core.item('Demographics (DM)');
    core.item('Trial Arms (TA)');
    const findings = tree.group('Findings');
    findings.item('Body Weights (BW)');
    findings.item('Lab Results (LB)');
    findings.item('Microscopic (MI)');
    findings.item('Macroscopic (MA)');
    findings.item('Organ Measurements (OM)');
    findings.item('Clinical Observations (CL)');
    return tree.root;
  });

  // Quick filters
  acc.addPane('Quick Filters', () => ui.divV([
    ui.choiceInput('Sex', 'All', ['All', 'M', 'F']),
    ui.choiceInput('Domain', 'LB', ['LB', 'BW', 'MI', 'MA', 'CL', 'OM']),
  ]));

  // Actions
  acc.addPane('Actions', () => ui.divV([
    ui.bigButton('Generate Report', () => { /* ... */ }),
    ui.button('Export Findings', () => { /* ... */ }),
  ]));

  view.toolbox = acc.root;
}


// =============================================================================
// 10. RIBBON — Top Action Bar
// =============================================================================
// Ribbon panels and ribbon menus appear at the top of the view.

function setupRibbon(view: DG.ViewBase): void {
  // Ribbon panels (icon buttons)
  view.setRibbonPanels([
    [
      ui.iconFA('download', () => grok.shell.info('Export clicked'), 'Export data'),
      ui.iconFA('sync', () => grok.shell.info('Refresh'), 'Refresh analysis'),
    ],
    [
      ui.iconFA('chart-bar', () => grok.shell.info('Add chart'), 'Add visualization'),
      ui.iconFA('cog', () => grok.shell.info('Settings'), 'Settings'),
    ]
  ]);

  // Ribbon dropdown menu
  view.ribbonMenu = DG.Menu.create()
    .group('Analysis')
      .item('Run Statistics', () => { /* ... */ })
      .item('Generate Insights', () => { /* ... */ })
      .endGroup()
    .group('Export')
      .item('Export to PDF', () => { /* ... */ })
      .item('Export to Excel', () => { /* ... */ })
      .endGroup();
}


// =============================================================================
// 11. SIDEBAR — Global Left-Side Navigation
// =============================================================================

function addSidebarPane(): void {
  grok.shell.sidebar.addPane('SEND', () => ui.divText('SEND Studies'), ui.iconFA('flask'));
}


// =============================================================================
// 12. DOCKING — Positioning Elements in the View
// =============================================================================
// Dock elements in specific positions within a view.

function dockingExample(view: DG.ViewBase): void {
  const detailPanel = ui.div([ui.h3('Details'), ui.divText('Select a row to see details')]);

  // Dock to the right, taking 30% of the width
  grok.shell.dockElement(detailPanel, 'Details', 'right', 0.3);

  // Other positions: 'left', 'top', 'bottom', 'fill'
}

// --- Using TableView's dockManager for precise control ---
function dockManagerExample(tv: DG.TableView): void {
  const viewer = DG.Viewer.scatterPlot(tv.dataFrame, { x: 'VISITDY', y: 'LBORRES' });
  // DockManager allows programmatic docking of viewers
  // tv.dockManager is available for advanced layouts
}


// =============================================================================
// 13. UI PRIMITIVES — Building Blocks
// =============================================================================

function uiPrimitives(): void {

  // --- Layout containers ---
  ui.divV([/* vertical stack */]);           // Vertical flex column
  ui.divH([/* horizontal row */]);           // Horizontal flex row
  ui.div([/* free-form container */]);       // Basic container
  ui.panel([/* padded container */]);        // 10px padded container
  ui.box(/* element */);                     // Fixed-size box (clips content, shows scrollbar)
  ui.splitH([/* left */, /* right */]);      // Horizontal splitter
  ui.splitV([/* top */, /* bottom */]);      // Vertical splitter

  // --- Text ---
  ui.h1('Header 1');
  ui.h2('Header 2');
  ui.h3('Header 3');
  ui.divText('Plain text in a div');
  ui.label('A label');
  ui.link('Click me', () => { /* handler */ }, 'Tooltip');
  ui.p('Paragraph text');

  // --- Interactive ---
  ui.button('Click', () => { /* handler */ });
  ui.bigButton('Primary Action', () => { /* handler */ });
  ui.iconFA('search', () => { /* handler */ }, 'Search tooltip');

  // --- Data display ---
  ui.tableFromMap({ 'Key1': 'Value1', 'Key2': 'Value2' });
  ui.list(['Item 1', 'Item 2', 'Item 3']);

  // --- Tabs ---
  ui.tabControl({
    'Tab One': () => ui.panel([ui.divText('Content 1')]),
    'Tab Two': () => ui.panel([ui.divText('Content 2')]),
  });

  // --- Cards ---
  ui.card(ui.divV([ui.h3('Card Title'), ui.divText('Card content')]));

  // --- Await / loading indicator ---
  ui.wait(async () => {
    // async work...
    return ui.divText('Loaded!');
  });

  // --- Markdown ---
  ui.markdown('## Header\n\nSome **bold** text');
}


// =============================================================================
// 14. INPUT CONTROLS — Forms and User Input
// =============================================================================

function inputControls(): void {
  // String input
  const nameInput = ui.input.string('Name', { value: 'default' });

  // Number input
  const doseInput = ui.input.float('Dose', { value: 10.0 });
  const intInput = ui.input.int('Count', { value: 5 });

  // Choice / dropdown
  const sexChoice = ui.input.choice('Sex', { value: 'M', items: ['M', 'F'] });

  // Multi-choice
  const domainChoice = ui.input.multiChoice('Domains', {
    value: ['LB', 'BW'],
    items: ['DM', 'LB', 'BW', 'MI', 'MA', 'CL', 'OM'],
  });

  // Boolean (checkbox)
  const showAll = ui.input.bool('Show All', { value: false });

  // Column selector (for a given dataframe)
  // const colInput = ui.input.column('Value Column', { table: df, value: df.col('LBORRES') });

  // React to changes
  sexChoice.onChanged.subscribe(() => {
    grok.shell.info(`Selected: ${sexChoice.value}`);
  });

  // Build a form
  const form = ui.inputs([nameInput, doseInput, sexChoice, showAll]);
}


// =============================================================================
// 15. DIALOGS — Modal Interaction
// =============================================================================

function dialogExample(): void {
  ui.dialog('Configure Analysis')
    .add(ui.input.choice('Test', { value: 'ALT', items: ['ALT', 'AST', 'ALP', 'TBIL'] }))
    .add(ui.input.choice('Method', { value: 'Dunnett', items: ['Dunnett', 'Williams', 'Dunn'] }))
    .add(ui.input.bool('Include Recovery', { value: false }))
    .onOK(() => {
      grok.shell.info('Analysis configured');
    })
    .show();
}


// =============================================================================
// 16. TREE VIEW — Hierarchical Navigation
// =============================================================================

function treeViewExample(): HTMLElement {
  const tree = ui.tree();

  const study = tree.group('Study 12345');
  const core = study.group('Core Domains');
  const dmItem = core.item('Demographics (DM)', { value: 'dm' });
  const taItem = core.item('Trial Arms (TA)', { value: 'ta' });

  const findings = study.group('Findings');
  const lbItem = findings.item('Laboratory (LB)', { value: 'lb' });
  const bwItem = findings.item('Body Weights (BW)', { value: 'bw' });
  const miItem = findings.item('Microscopic (MI)', { value: 'mi' });

  // Handle click
  tree.onSelectedChanged.subscribe((item) => {
    grok.shell.info(`Selected: ${item}`);
  });

  return tree.root;
}


// =============================================================================
// 17. TOASTS / NOTIFICATIONS
// =============================================================================

function notifications(): void {
  grok.shell.info('Operation completed');          // Info (blue)
  grok.shell.warning('Check your configuration');   // Warning (yellow)
  grok.shell.error('Failed to load data');          // Error (red)
}


// =============================================================================
// 18. TOOLTIPS
// =============================================================================

function tooltipExample(): HTMLElement {
  const element = ui.divText('Hover over me');
  ui.tooltip.bind(element, 'This is additional information');
  return element;
}

// --- Rich tooltip (HTML content) ---
function richTooltip(): HTMLElement {
  const element = ui.divText('Hover for details');
  ui.tooltip.bind(element, () => ui.divV([
    ui.h3('Subject 001'),
    ui.tableFromMap({ 'Group': 'High Dose', 'Sex': 'M', 'Weight': '250g' }),
  ]));
  return element;
}


// =============================================================================
// 19. CONTEXT MENUS (Right-click Popup)
// =============================================================================

function contextMenuExample(): void {
  const menu = DG.Menu.popup();
  menu.item('View Details', () => { /* ... */ });
  menu.item('Export Selection', () => { /* ... */ });
  menu.separator();
  menu.item('Flag as Outlier', () => { /* ... */ });
  menu.show();
}


// =============================================================================
// 20. EVENTS — Subscribing to Platform Events
// =============================================================================

function eventExamples(df: DG.DataFrame): void {
  // DataFrame events
  df.onCurrentRowChanged.subscribe(() => { /* row focus changed */ });
  df.onSelectionChanged.subscribe(() => { /* selection changed */ });
  df.onFilterChanged.subscribe(() => { /* filter changed */ });
  df.onValuesChanged.subscribe(() => { /* cell values edited */ });
  df.onColumnsAdded.subscribe(() => { /* columns added */ });

  // Debounce for performance (important for expensive operations)
  DG.debounce(df.onSelectionChanged, 300).subscribe(() => {
    // Runs at most once per 300ms
  });

  // Global platform events
  grok.events.onCurrentViewChanged.subscribe((view) => { /* active view changed */ });
  grok.events.onTableAdded.subscribe((args) => { /* new table in workspace */ });
}


// =============================================================================
// 21. CUSTOM VIEWER (JsViewer subclass)
// =============================================================================
// Use this pattern for complex custom visualizations.
// Simpler approaches (standalone DG.Viewer instances) are usually preferred.

export class DoseResponseViewer extends DG.JsViewer {
  valueColumnName: string;
  doseColumnName: string;

  constructor() {
    super();
    this.valueColumnName = this.string('valueColumnName', 'LBORRES');
    this.doseColumnName = this.string('doseColumnName', 'EXDOSE');
  }

  onTableAttached(): void {
    this.subs.push(DG.debounce(this.dataFrame.selection.onChanged, 50)
      .subscribe(() => this.render()));
    this.subs.push(DG.debounce(this.dataFrame.filter.onChanged, 50)
      .subscribe(() => this.render()));
    this.render();
  }

  render(): void {
    // Clear and redraw
    this.root.innerHTML = '';
    const valueCol = this.dataFrame.col(this.valueColumnName);
    const doseCol = this.dataFrame.col(this.doseColumnName);
    if (!valueCol || !doseCol) return;

    // Build your visualization here (D3, canvas, HTML, etc.)
    this.root.append(ui.divText(`Dose-Response: ${valueCol.name} vs ${doseCol.name}`));
  }

  onPropertyChanged(property: DG.Property): void {
    super.onPropertyChanged(property);
    this.render();
  }
}

// Register the viewer in package.ts:
//name: Dose Response
//description: Dose-response visualization for SEND data
//tags: viewer
//meta.icon: images/dose-response-icon.png
//meta.toolbox: true
//meta.trellisable: true
//meta.viewerPosition: right
//output: viewer result
export function doseResponseViewer(): DoseResponseViewer {
  return new DoseResponseViewer();
}

// Alternative: runtime registration (e.g., during app init)
// grok.shell.registerViewer('Dose Response', 'Dose-response visualization', () => new DoseResponseViewer());

// Available //meta.* options for viewer registration:
// meta.icon         — path to custom icon file
// meta.toolbox      — true to show in TableView toolbox
// meta.trellisable  — true to allow use as inner viewer in trellis plots
// meta.viewerPath   — menu path (e.g., "Chemistry | Structures")
// meta.viewerPosition — default dock: top, bottom, left, right, fill, auto


// =============================================================================
// 22. SEMANTIC TYPE DETECTOR
// =============================================================================
// Place in detectors.ts (separate file). Datagrok calls these on every table open.

// class SendBrowserDetectors extends DG.Package {
//   //tags: semTypeDetector
//   //input: column col
//   //output: string semType
//   detectSubjectId(col: DG.Column): string | null {
//     if (col.name === 'USUBJID' && col.type === DG.COLUMN_TYPE.STRING)
//       return 'SubjectId';
//     return null;
//   }
// }


// =============================================================================
// 23. GRID CUSTOMIZATION — Cell Rendering, Color Coding
// =============================================================================

function gridCustomization(tv: DG.TableView, df: DG.DataFrame): void {
  const grid = tv.grid;

  // Color-code cells based on value
  grid.onCellPrepare((gc) => {
    if (gc.isTableCell && gc.tableColumn!.name === 'P_Value') {
      const p = gc.cell.value;
      if (p < 0.001) gc.style.backColor = DG.Color.fromHtml('#FF6B6B');      // Red
      else if (p < 0.05) gc.style.backColor = DG.Color.fromHtml('#FFD93D');  // Yellow
      else gc.style.backColor = DG.Color.fromHtml('#6BCB77');                 // Green
    }

    // Color-code significance flags
    if (gc.isTableCell && gc.tableColumn!.name === 'Significance') {
      const sig = gc.cell.value;
      if (sig === '***') gc.style.backColor = DG.Color.fromHtml('#FF6B6B');
      else if (sig === '**') gc.style.backColor = DG.Color.fromHtml('#FFA07A');
      else if (sig === '*') gc.style.backColor = DG.Color.fromHtml('#FFD93D');
    }
  });

  // Set column width
  grid.col('USUBJID')!.width = 120;

  // Hide columns
  grid.col('internal_id')?.visible = false;

  // Reorder columns
  grid.columns.setOrder(['USUBJID', 'ARM', 'SEX', 'LBTESTCD', 'LBORRES', 'P_Value']);
}


// =============================================================================
// 24. TASKBAR PROGRESS INDICATOR
// =============================================================================

async function longRunningTask(): Promise<void> {
  const pi = DG.TaskBarProgressIndicator.create('Loading SEND data...');
  try {
    // ... do work
    pi.update(50, 'Processing domains...');
    // ... more work
    pi.update(90, 'Computing statistics...');
  } finally {
    pi.close();
  }
}


// =============================================================================
// 25. COMPLETE PATTERN: Building a Study Analysis View
// =============================================================================
// This shows how the pieces fit together for a real view.

async function buildStudyAnalysisView(
  dmDf: DG.DataFrame,
  lbDf: DG.DataFrame
): Promise<DG.TableView> {

  // 1. Join domains
  const joined = grok.data.joinTables(dmDf, lbDf,
    ['USUBJID'], ['USUBJID'],
    ['USUBJID', 'ARM', 'SEX', 'ARMCD'],
    ['LBTESTCD', 'LBORRES', 'LBORRESU', 'VISITDY'],
    DG.JOIN_TYPE.LEFT, false
  );
  joined.name = 'Lab Results with Demographics';

  // 2. Create table view
  const tv = grok.shell.addTableView(joined);
  tv.name = 'Laboratory Analysis';

  // 3. Setup ribbon
  tv.setRibbonPanels([[
    ui.iconFA('file-export', () => { /* export */ }, 'Export'),
    ui.iconFA('sync', () => { /* refresh */ }, 'Refresh'),
  ]]);

  // 4. Setup toolbox with accordion
  const toolboxAcc = ui.accordion('Analysis');
  toolboxAcc.addPane('Filters', () => ui.divV([
    ui.choiceInput('Test', 'ALT', ['ALT', 'AST', 'ALP', 'TBIL', 'CREAT']),
    ui.choiceInput('Sex', 'All', ['All', 'M', 'F']),
  ]));
  toolboxAcc.addPane('Actions', () => ui.divV([
    ui.bigButton('Run Statistics', () => { /* ... */ }),
    ui.button('Compare Groups', () => { /* ... */ }),
  ]));
  tv.toolbox = toolboxAcc.root;

  // 5. Add viewers
  tv.filters({ filters: [
    { column: 'ARM', type: DG.FILTER_TYPE.CATEGORICAL },
    { column: 'SEX', type: DG.FILTER_TYPE.CATEGORICAL },
    { column: 'LBTESTCD', type: DG.FILTER_TYPE.CATEGORICAL },
  ]});

  tv.boxPlot({ value: 'LBORRES', category: 'ARM' });
  tv.lineChart({ x: 'VISITDY', y: 'LBORRES', split: 'ARM' });

  // 6. Color-code grid
  tv.grid.onCellPrepare((gc) => {
    if (gc.isTableCell && gc.tableColumn!.name === 'LBORRES') {
      // Example: flag high values
      if (gc.cell.value > 100)
        gc.style.backColor = DG.Color.fromHtml('#FF6B6B');
    }
  });

  // 7. React to row selection for context panel updates
  joined.onCurrentRowChanged.subscribe(() => {
    const row = joined.currentRow;
    if (!row) return;
    // Update any custom panel content based on selected row
  });

  return tv;
}


// =============================================================================
// 26. FILE I/O — Loading Data from Package Resources
// =============================================================================

async function loadStudyData(): Promise<DG.DataFrame> {
  // Load from package file resources
  const csv = await _package.files.readAsText('data/dm.csv');
  return DG.DataFrame.fromCsv(csv);
}

// Load multiple files
async function loadAllDomains(): Promise<Map<string, DG.DataFrame>> {
  const domains = new Map<string, DG.DataFrame>();
  const domainNames = ['dm', 'lb', 'bw', 'mi', 'ma', 'cl', 'om', 'tf'];
  for (const name of domainNames) {
    try {
      const csv = await _package.files.readAsText(`data/${name}.csv`);
      domains.set(name, DG.DataFrame.fromCsv(csv));
    } catch (e) {
      console.warn(`Domain ${name} not found, skipping`);
    }
  }
  return domains;
}


// =============================================================================
// 27. COLUMN MANAGER / COLUMN VISIBILITY
// =============================================================================
// Column Manager is a built-in Datagrok feature (Status Bar > Columns:)
// You typically don't need custom code for it, but you can control
// column visibility and order programmatically:

function manageColumns(tv: DG.TableView): void {
  const grid = tv.grid;

  // Hide columns user doesn't need to see
  const hiddenCols = ['STUDYID', 'DOMAIN', 'LBSEQ', 'LBREFID'];
  for (const colName of hiddenCols) {
    const gc = grid.col(colName);
    if (gc) gc.visible = false;
  }

  // Set display order
  grid.columns.setOrder(['USUBJID', 'ARM', 'SEX', 'LBTESTCD', 'LBORRES', 'LBORRESU', 'VISITDY']);
}


// =============================================================================
// 28. STICKY META — Persistent Annotations on Data Entities
// =============================================================================
// Two layers: lightweight column/DataFrame tags, and database-backed StickyMeta.

// --- Column Tags (always available, stored with the data) ---
function columnTagExamples(df: DG.DataFrame): void {
  const col = df.col('LBORRES')!;

  // Set/get string tags (chainable)
  col.setTag('units', 'U/L').setTag('source', 'Lab Results');
  const units = col.getTag('units');  // 'U/L'

  // Semantic type (convenience over the 'quality' tag)
  col.semType = 'SubjectId';
  const semType = col.semType;  // 'SubjectId'

  // Tags proxy for common metadata
  col.tags.format = '#.00';           // Display format
  col.tags[DG.TAGS.DESCRIPTION] = 'Laboratory result value';
  col.tags[DG.TAGS.FRIENDLY_NAME] = 'Result';

  // Filter columns by tags
  const matched = df.columns.byTags({ 'units': 'U/L' });

  // DataFrame-level tags (e.g., tooltip columns)
  df.tags[DG.TAGS.TOOLTIP] = 'USUBJID, LBTESTCD, LBORRES';
}

// --- StickyMeta (database-backed, persistent across sessions) ---
// StickyMeta attaches structured annotations to entities identified by semantic type.
// Schemas define entity types + typed properties. Data is persisted in Postgres.
//
// TBD: StickyMeta is marked beta. The schema creation API may change.
// The UI-based workflow (Browse > Platform > Sticky Meta > Schemas) is the
// primary documented path. Programmatic API below:
async function stickyMetaExample(): Promise<void> {
  const sm = new DG.StickyMeta();

  // List existing schemas
  const schemas = await sm.getSchemas();

  // Read annotation values for a set of entities
  // The keys column must have a semType matching the schema's entity type
  // const values: DG.DataFrame = await sm.getAllValues(schema, keysColumn);

  // Write annotation values
  // const valuesDf = DG.DataFrame.create(2);
  // valuesDf.columns.addNewString('annotation_field').init((i) => ['value1', 'value2'][i]);
  // await sm.setAllValues(schema, keysColumn, valuesDf);
}


// =============================================================================
// 29. CROSS-VIEW NAVIGATION — View Switching with Context
// =============================================================================
// Datagrok views that share the same DataFrame automatically share
// selection (BitSet) and filter (BitSet). This is the primary mechanism
// for cross-view context propagation — no explicit state passing needed.

function crossViewNavigation(df: DG.DataFrame): void {

  // --- Create multiple views on the SAME DataFrame ---
  const gridView = grok.shell.addTableView(df);
  gridView.name = 'Lab Results - Grid';

  const chartView = grok.shell.addTableView(df);
  chartView.name = 'Lab Results - Charts';
  chartView.addViewer('Scatter plot', { x: 'VISITDY', y: 'LBORRES' });

  // --- Programmatic view switching ---
  // Set active view directly
  grok.shell.v = gridView;

  // Find view by name
  const target = grok.shell.view('Lab Results - Charts');
  if (target) grok.shell.v = target;

  // Access the current TableView
  const currentTv = grok.shell.tv;

  // --- Filter context is shared automatically ---
  // Filtering in gridView immediately affects chartView (same DataFrame)
  df.filter.init((i) => df.get('VISITDY', i) > 1);

  // Selection is also shared
  df.selection.init((i) => df.get('P_Value', i) < 0.05);

  // --- Listen for view changes ---
  grok.events.onCurrentViewChanged.subscribe(() => {
    const viewName = grok.shell.v?.name;
    // Update context, refresh panels, etc.
  });

  // --- Custom events for app-level coordination ---
  // Fire a custom event from one view
  grok.events.fireCustomEvent('send-browser:navigate', {
    targetView: 'Histopathology',
    filterContext: { organ: 'Liver', finding: 'Necrosis' }
  });

  // Listen for it in another view
  grok.events.onCustomEvent('send-browser:navigate').subscribe((args: any) => {
    const targetView = grok.shell.view(args.targetView);
    if (targetView) {
      grok.shell.v = targetView;
      // Apply filter context from args.filterContext
    }
  });

  // --- URL-based navigation ---
  // grok.shell.route('/table/Lab Results - Grid');
}


// =============================================================================
// 30. PYTHON SCRIPT INVOCATION — Server-Side Computation
// =============================================================================
// Python scripts are registered via annotation headers in .py files
// placed in <package>/scripts/. They are called from TypeScript via
// grok.functions.call() and DataFrames are auto-converted to/from pandas.

// --- Step 1: Define the script (scripts/compute_stats.py) ---
// Place this in the package's scripts/ directory:
//
// #name: ComputeGroupStats
// #description: Computes group-level statistics for a lab parameter
// #language: python
// #tags: analysis
// #input: dataframe table [Input data with lab results]
// #input: string testCode [Lab test code, e.g. ALT]
// #input: double alpha = 0.05 {min: 0.001; max: 0.1} [Significance level]
// #output: dataframe result [Group means, SDs, and p-values]
// #output: double overallP [Overall ANOVA p-value]
//
// import pandas as pd
// from scipy import stats
//
// filtered = table[table['LBTESTCD'] == testCode]
// groups = filtered.groupby('ARMCD')['LBORRES']
// result = groups.agg(['mean', 'std', 'count']).reset_index()
// _, overallP = stats.f_oneway(*[g.values for _, g in groups])

// --- Step 2: Call from TypeScript ---
async function callPythonScript(df: DG.DataFrame): Promise<void> {

  // Single output — result assigned directly
  const result: DG.DataFrame = await grok.functions.call(
    'SendBrowser:ComputeGroupStats',       // <PackageName>:<FunctionName>
    {
      table: df,
      testCode: 'ALT',
      alpha: 0.05
    },
    true  // show progress indicator in taskbar
  );

  // Multiple outputs — result is an object with named fields
  const multiResult = await grok.functions.call(
    'SendBrowser:ComputeGroupStats',
    { table: df, testCode: 'ALT', alpha: 0.05 }
  );
  const statsDf: DG.DataFrame = multiResult['result'];
  const pValue: number = multiResult['overallP'];

  // Display results
  grok.shell.addTableView(statsDf);
  grok.shell.info(`Overall p-value: ${pValue.toFixed(4)}`);
}

// --- With progress indicator for long-running scripts ---
async function callWithProgress(df: DG.DataFrame): Promise<void> {
  const pi = DG.TaskBarProgressIndicator.create('Computing statistics...');
  try {
    const result = await grok.functions.call(
      'SendBrowser:ComputeGroupStats',
      { table: df, testCode: 'ALT' }
    );
    pi.update(100, 'Done');
  } finally {
    pi.close();
  }
}

// Supported script parameter types:
// int, double, bool, string, datetime — JS primitives
// dataframe — DG.DataFrame ↔ pandas.DataFrame (auto-converted)
// column — DG.Column
// column_list — DG.Column[] (multiple columns)
// file, blob — binary data
// graphics — server-rendered image
//
// Script annotation options (in curly braces):
// {min: 0; max: 100}           — numeric range
// {type: numerical}             — column type constraint
// {type: categorical}           — column type constraint
// {choices: ["a", "b", "c"]}   — dropdown choices


// =============================================================================
// REFERENCE: Datagrok Component → API Mapping
// =============================================================================
//
// | UI Component          | Datagrok Concept        | API / Class                                  |
// |-----------------------|-------------------------|----------------------------------------------|
// | Main data grid        | Grid (in TableView)     | tv.grid, DG.Viewer.grid(df)                  |
// | Left panel (tools)    | Toolbox                 | view.toolbox = element                       |
// | Right panel (details) | Context Panel           | //tags: panel, widgets (annotation)          |
// | Info sections (right) | Info Panes              | //tags: panel, widgets → DG.Widget           |
// | Top action bar        | Ribbon                  | view.setRibbonPanels(), view.ribbonMenu      |
// | Top dropdown menus    | Ribbon Menu             | view.ribbonMenu = DG.Menu.create()           |
// | Data filters          | Filters viewer          | tv.filters() or tv.addViewer('Filters')      |
// | Collapsible sections  | Accordion               | ui.accordion('title')                        |
// | Tab navigation        | Tab Control             | ui.tabControl({...})                         |
// | Hierarchical nav      | Tree View               | ui.tree()                                    |
// | Modal window          | Dialog                  | ui.dialog('title')                           |
// | Status messages       | Toasts                  | grok.shell.info/warning/error()              |
// | Progress indicator    | TaskBar Progress        | DG.TaskBarProgressIndicator.create()         |
// | Bottom bar            | Status Bar              | grok.shell.statusBar (limited API)           |
// | Global left nav       | Sidebar                 | grok.shell.sidebar.addPane()                 |
// | Column visibility     | Column Manager (built-in)| grid.col('x').visible = false               |
// | Element positioning   | Dock Manager            | grok.shell.dockElement() / view.dockManager  |
// | Horizontal layout     | Splitter H              | ui.splitH([...])                             |
// | Vertical layout       | Splitter V              | ui.splitV([...])                             |
// | Charts/visualizations | Viewers                 | tv.addViewer(), DG.Viewer.fromType()         |
// | Right-click menu      | Context Menu            | DG.Menu.popup()                              |
// | Hover info            | Tooltip                 | ui.tooltip.bind(element, content)            |
// | Column metadata       | Tags (setTag/getTag)    | col.setTag(k,v), col.getTag(k), col.tags.*   |
// | Persistent annotations| Sticky Meta             | DG.StickyMeta (beta), col.semType triggers   |
// | View switching        | Shell navigation        | grok.shell.v = view, grok.shell.view(name)   |
// | Cross-view context    | Shared DataFrame        | Same df → shared filter/selection BitSets     |
// | Custom events         | Event bus               | grok.events.fireCustomEvent / onCustomEvent   |
// | Python scripts        | Functions               | grok.functions.call('Pkg:Func', {params})    |
//
// =============================================================================
