"""Seed definitions for the solar engine, derived from the 5 MW Rooftop
Solar study book. Everything here is a starting point — editable in admin /
via the template APIs after seeding.

Quantities use a per-unit `basis` + `factor`, so they scale with any project.
Rates are left at 0 by default (commercial rates are company/tender specific).
"""
from . import constants as C

# Component specs — the book's 5 MW training example.
DEFAULT_SPEC = {
    'name': 'Study Book Default (5 MW basis)',
    'is_default': True,
    'module_wp': '550',
    'modules_per_string': 26,
    'inverter_kw': '125',
    'transformer_mva': '2.5',
    'inverters_per_acdb': 10,
    'lv_voltage': 415,
    'ht_voltage_kv': '11',
    'target_dc_ac_ratio': '1.200',
}

# --- WBS stages (code, name, is_parallel, [work packages]) ----------------
# Shared electrical/control spine; mode-specific survey & civil packages.
_COMMON_TAIL = [
    ('MOUNT', 'Mounting & Module Installation', False, [
        'Mounting structure erection', 'Alignment, torque & bonding',
        'Module installation', 'String cabling & numbering',
    ]),
    ('DCPRE', 'DC Installation & Pre-Commissioning', False, [
        'DC cabling & routing', 'DC isolators / SPD where required',
        'Polarity check', 'String Voc measurement', 'Insulation resistance test',
        'I-V curve & thermography',
    ]),
    ('ACHT', 'AC / Transformer / HT', False, [
        'ACDB installation', 'LT cabling', 'Transformer installation & testing',
        'HT panel (VCB / CT / PT / relay)', 'PCC & metering',
    ]),
    ('SAFE', 'Safety Systems', True, [
        'Equipment earthing & bonding', 'Earth grid / electrodes',
        'Lightning protection (air terminal, down conductor)', 'SPD coordination',
    ]),
    ('CTRL', 'Monitoring & Control', True, [
        'SCADA & data logger', 'Weather station', 'Power Plant Controller (PPC)',
    ]),
    ('TEST', 'Testing & Commissioning', False, [
        'AC / transformer / HT tests', 'Pre-commissioning checklist closure',
        'Energization sequence', 'Grid synchronization', 'Anti-islanding / grid protection',
    ]),
    ('PERF', 'Performance Test', False, [
        'Performance ratio (PR) monitoring', 'Energy (MWh) & availability',
        'Punch-list closure',
    ]),
    ('HAND', 'Handover', False, [
        'As-built drawings & SLD', 'Test & commissioning reports',
        'Relay settings & calibration certificates', 'Warranties & O&M manuals',
        'Training & signed handover',
    ]),
    ('OANDM', 'O&M', False, [
        'Scheduled preventive maintenance', 'Performance monitoring', 'Spares management',
    ]),
]

_DESIGN_PROC = [
    ('ENGG', 'Engineering & Design', False, [
        'SLD & electrical design', 'Module / string / inverter layout',
        'AC & cable route layout', 'Earthing & lightning layout', 'HT layout',
        'SCADA / network architecture', 'IFC drawing revision control',
    ]),
    ('APPR', 'Approvals', False, [
        'Structural / civil approval', 'Utility / grid SLD approval', 'Metering approval',
    ]),
    ('PROC', 'Procurement & Inspection', False, [
        'Modules & structure', 'Inverter, cables & ACDB', 'Transformer & HT panel',
        'Metering, earthing, LPS & SCADA', 'Material receipt / NCR records',
    ]),
]

WBS_ROOFTOP = [
    ('SURVEY', 'Survey & Feasibility', False, [
        'Roof area, type & condition survey', 'Obstacle & shadow analysis',
        'Existing LT/HT & cable-route identification', 'Structural / roof-load survey',
        'Usable shadow-free area & feasibility',
    ]),
] + _DESIGN_PROC + [
    ('ROOFPREP', 'Mobilization & Roof Preparation', False, [
        'Site mobilization', 'Roof preparation & cleaning',
        'Waterproofing & penetration treatment', 'Ballast / fixing arrangement',
    ]),
] + _COMMON_TAIL

WBS_GROUND = [
    ('SURVEY', 'Survey & Feasibility', False, [
        'Topographical / land survey', 'Soil resistivity test (Wenner four-point)',
        'Shadow analysis & row spacing', 'Geotechnical / pile-load assessment',
        'Usable area & feasibility',
    ]),
] + _DESIGN_PROC + [
    ('CIVIL', 'Mobilization & Civil Works', False, [
        'Site mobilization & levelling', 'Pile foundations / pedestals',
        'Module table / seasonal-tilt structure', 'Cable trenching & ducting',
        'Internal roads, drainage & boundary', 'Control room / security',
    ]),
] + _COMMON_TAIL


# --- BOQ sections -> items -------------------------------------------------
# item = (description, unit, basis, factor, spec_note)
def _common_boq_sections(project_type):
    structure_items = (
        [('Module mounting structure (rooftop, galvanised)', 'MWp', C.BASIS_PER_MWP_DC, '1', 'Elevated/ballasted roof structure')]
        if project_type == C.PROJECT_TYPE_ROOFTOP else
        [
            ('Ground-mount module table structure', 'MWp', C.BASIS_PER_MWP_DC, '1', 'Fixed-tilt / seasonal-tilt tables'),
            ('Pile foundation / pedestal', 'Nos', C.BASIS_PER_STRING, '2', 'Per-table foundation count (seed; refine from layout)'),
        ]
    )
    civil_section = (
        ('Roof Civil & Waterproofing', False, [
            ('Roof preparation & cleaning', 'MWp', C.BASIS_PER_MWP_DC, '1', ''),
            ('Waterproofing & penetration treatment', 'MWp', C.BASIS_PER_MWP_DC, '1', ''),
        ])
        if project_type == C.PROJECT_TYPE_ROOFTOP else
        ('Site Civil Works', False, [
            ('Land levelling & grading', 'MW', C.BASIS_PER_MW_AC, '1', ''),
            ('Cable trenching & ducting', 'MWp', C.BASIS_PER_MWP_DC, '1', ''),
            ('Internal roads, drainage & boundary', 'MW', C.BASIS_PER_MW_AC, '1', ''),
        ])
    )
    return [
        # (section_name, is_material, [items])
        ('PV Modules', True, [
            ('Solar PV module', 'Nos', C.BASIS_PER_MODULE, '1', '550 Wp (per spec set)'),
        ]),
        ('Mounting Structure', True, structure_items),
        ('DC System', True, [
            ('DC string cable set (1C x 4/6 sq.mm)', 'MWp', C.BASIS_PER_MWP_DC, '3000', 'Length seed per MWp — refine from layout'),
            ('DC connectors (pairs)', 'Nos', C.BASIS_PER_STRING, '2', ''),
            ('DC SPD / isolator (where required)', 'Nos', C.BASIS_PER_INVERTER, '1', ''),
        ]),
        ('Inverters', True, [
            ('String/central inverter', 'Nos', C.BASIS_PER_INVERTER, '1', '125 kW (per spec set)'),
        ]),
        ('AC System', True, [
            ('ACDB', 'Nos', C.BASIS_PER_ACDB, '1', ''),
            ('LT cable (inverter to transformer)', 'MW', C.BASIS_PER_MW_AC, '400', 'Length seed per MW'),
            ('AC SPD', 'Nos', C.BASIS_PER_ACDB, '1', ''),
        ]),
        ('Transformer', True, [
            ('Step-up transformer', 'Nos', C.BASIS_PER_TRANSFORMER, '1', '2.5 MVA, 415V/11kV (per spec set)'),
        ]),
        ('HT System', True, [
            ('HT VCB (incomer / outgoing / bus-coupler)', 'Nos', C.BASIS_FIXED, '4', 'Refine from approved SLD'),
            ('CT / PT / VT set', 'Set', C.BASIS_PER_TRANSFORMER, '1', ''),
            ('Protection relay', 'Nos', C.BASIS_PER_TRANSFORMER, '1', '50/51, 50N/51N etc.'),
            ('HT metering set (PCC)', 'Set', C.BASIS_FIXED, '1', ''),
        ]),
        ('Earthing', True, [
            ('Earth pit / electrode', 'Nos', C.BASIS_PER_MW_AC, '8', 'Seed; finalise from soil resistivity & study'),
            ('Earthing strip / conductor', 'MW', C.BASIS_PER_MW_AC, '500', 'Length seed per MW'),
        ]),
        ('Lightning Protection', True, [
            ('Air terminal & down conductor set', 'Nos', C.BASIS_PER_MW_AC, '2', ''),
        ]),
        ('SCADA / PPC & Weather', True, [
            ('SCADA & data logger', 'Set', C.BASIS_FIXED, '1', ''),
            ('Weather station (pyranometer, temp, wind)', 'Set', C.BASIS_FIXED, '1', ''),
            ('Power Plant Controller (PPC)', 'Set', C.BASIS_FIXED, '1', ''),
        ]),
        ('Cable Trays & Accessories', True, [
            ('Cable tray & accessories', 'MWp', C.BASIS_PER_MWP_DC, '1', ''),
        ]),
        civil_section,
        ('Testing & Commissioning', False, [
            ('Testing & commissioning (services)', 'MW', C.BASIS_PER_MW_AC, '1', ''),
        ]),
        ('Engineering & Documentation', False, [
            ('Engineering, drawings & documentation', 'MW', C.BASIS_PER_MW_AC, '1', ''),
        ]),
    ]


BOQ_ROOFTOP = _common_boq_sections(C.PROJECT_TYPE_ROOFTOP)
BOQ_GROUND = _common_boq_sections(C.PROJECT_TYPE_GROUND)
