"""Enumerations for the solar project work-structure & BOQ engine."""

# --- Execution mode -------------------------------------------------------
PROJECT_TYPE_ROOFTOP = 'rooftop'
PROJECT_TYPE_GROUND = 'ground_mount'
PROJECT_TYPE_CHOICES = [
    (PROJECT_TYPE_ROOFTOP, 'Open Roof (Rooftop)'),
    (PROJECT_TYPE_GROUND, 'On-Site Solar EPC (Ground-mount)'),
]

# --- Ground-mount foundation (civil BOQ driver) ---------------------------
FOUNDATION_PILE = 'driven_pile'
FOUNDATION_PEDESTAL = 'concrete_pedestal'
FOUNDATION_CHOICES = [
    (FOUNDATION_PILE, 'Driven Pile'),
    (FOUNDATION_PEDESTAL, 'Concrete Pedestal'),
]

# --- How a BOQ line's quantity is seeded from a project's parameters -------
BASIS_FIXED = 'fixed'
BASIS_PER_MW_AC = 'per_mw_ac'
BASIS_PER_MWP_DC = 'per_mwp_dc'
BASIS_PER_STRING = 'per_string'
BASIS_PER_INVERTER = 'per_inverter'
BASIS_PER_TRANSFORMER = 'per_transformer'
BASIS_PER_ACDB = 'per_acdb'
BASIS_PER_MODULE = 'per_module'
QUANTITY_BASIS_CHOICES = [
    (BASIS_FIXED, 'Fixed quantity'),
    (BASIS_PER_MW_AC, 'Per MW (AC)'),
    (BASIS_PER_MWP_DC, 'Per MWp (DC)'),
    (BASIS_PER_STRING, 'Per string'),
    (BASIS_PER_INVERTER, 'Per inverter'),
    (BASIS_PER_TRANSFORMER, 'Per transformer'),
    (BASIS_PER_ACDB, 'Per ACDB'),
    (BASIS_PER_MODULE, 'Per module'),
]

# --- Stage / work-package execution status --------------------------------
STATUS_PENDING = 'pending'
STATUS_IN_PROGRESS = 'in_progress'
STATUS_COMPLETED = 'completed'
STATUS_ON_HOLD = 'on_hold'
STATUS_SKIPPED = 'skipped'
EXECUTION_STATUS_CHOICES = [
    (STATUS_PENDING, 'Pending'),
    (STATUS_IN_PROGRESS, 'In Progress'),
    (STATUS_COMPLETED, 'Completed'),
    (STATUS_ON_HOLD, 'On Hold'),
    (STATUS_SKIPPED, 'Skipped'),
]

# --- Build lifecycle ------------------------------------------------------
BUILD_DRAFT = 'draft'
BUILD_LOCKED = 'locked'
BUILD_IN_EXECUTION = 'in_execution'
BUILD_COMPLETED = 'completed'
BUILD_STATUS_CHOICES = [
    (BUILD_DRAFT, 'Draft'),
    (BUILD_LOCKED, 'Locked'),
    (BUILD_IN_EXECUTION, 'In Execution'),
    (BUILD_COMPLETED, 'Completed'),
]
