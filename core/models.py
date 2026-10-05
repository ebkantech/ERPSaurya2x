from django.db import models


class Company(models.Model):
    name = models.CharField(max_length=200)
    address = models.TextField(blank=True)

    def __str__(self):
        return self.name


class Vendor(models.Model):
    VENDOR_PREFIX = 'VPF'

    company_name = models.CharField(max_length=200)
    vendor_name = models.CharField(max_length=200, blank=True)
    experience_details = models.TextField(blank=True)
    address = models.TextField(blank=True)
    address2 = models.CharField(max_length=200, blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True)
    pin_code = models.CharField(max_length=20, blank=True)
    country = models.CharField(max_length=100, blank=True)

    vendor_type = models.CharField(max_length=100, blank=True)
    vendor_category = models.CharField(max_length=100, blank=True)
    contact_person = models.CharField(max_length=100, blank=True)
    mobile_number = models.CharField(max_length=20, blank=True)
    email_id = models.EmailField(blank=True)
    attendee_name = models.CharField(max_length=200, blank=True)
    bde_name = models.CharField(max_length=200, blank=True)
    meeting_with = models.CharField(max_length=200, blank=True)
    qualification_status = models.CharField(max_length=50, blank=True)
    msme_reg = models.CharField(max_length=100, blank=True)
    pan_no = models.CharField(max_length=30, blank=True)
    pf_reg = models.CharField(max_length=100, blank=True)
    gst_no = models.CharField(max_length=30, blank=True)
    gst_type = models.CharField(max_length=100, blank=True)
    gst_status = models.CharField(max_length=100, blank=True)
    last_gstr1 = models.CharField(max_length=20, blank=True)
    gst_pending_status = models.CharField(max_length=100, blank=True)
    aadhaar_no = models.CharField(max_length=20, blank=True)
    labour_welfare_fund = models.CharField(max_length=100, blank=True)
    professional_tax = models.CharField(max_length=100, blank=True)
    turnover_year_1 = models.CharField(max_length=100, blank=True)
    turnover_year_2 = models.CharField(max_length=100, blank=True)
    turnover_year_3 = models.CharField(max_length=100, blank=True)
    bank_account_name = models.CharField(max_length=150, blank=True)
    bank_name_address = models.TextField(blank=True)
    account_type = models.CharField(max_length=50, blank=True)
    account_number = models.CharField(max_length=30, blank=True)
    bank_details = models.TextField(blank=True)
    bank_proof_type = models.CharField(max_length=50, blank=True)
    passbook_file = models.FileField(upload_to='vendor_docs/', blank=True, null=True)
    client_list_data = models.TextField(blank=True)
    status = models.CharField(max_length=30, blank=True, default='active')

    vendor_id = models.CharField(max_length=50, unique=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        creating = self.pk is None
        super().save(*args, **kwargs)
        if creating and not self.vendor_id:
            self.vendor_id = f"{self.VENDOR_PREFIX}{str(self.pk).zfill(3)}"
            super().save(update_fields=['vendor_id'])

    def __str__(self):
        return f"{self.company_name} ({self.vendor_id})"

    class Meta:
        db_table = 'vendor_registration'


class MaterialMaster(models.Model):
    material_code = models.CharField(max_length=100, blank=True)
    work_package = models.CharField(max_length=150, blank=True)
    material_name = models.CharField(max_length=255, blank=True)
    specification = models.TextField(blank=True)
    qty = models.IntegerField(null=True, blank=True)
    qty_specification = models.CharField(max_length=100, blank=True)
    no_of_site = models.CharField(max_length=100, blank=True)
    mw = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    lt_panel = models.CharField(max_length=255, blank=True)
    lt_panels = models.CharField(max_length=255, blank=True)
    pf_rate = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    amount = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    hsn_code = models.CharField(max_length=20, blank=True)
    gst_percentage = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'material_master'


class WorkPackage(models.Model):
    name = models.CharField(max_length=150, unique=True)
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name

    class Meta:
        db_table = 'work_packages'
        ordering = ['display_order', 'id']


class BusinessUnit(models.Model):
    name = models.CharField(max_length=150, unique=True)
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name

    class Meta:
        db_table = 'business_units'
        ordering = ['display_order', 'id']


class ProjectMaster(models.Model):
    project_code = models.CharField(max_length=50, unique=True, blank=True)
    project_name = models.CharField(max_length=255)
    client_name = models.CharField(max_length=255, blank=True)
    procurement_source = models.CharField(max_length=100, blank=True)
    business_unit = models.CharField(max_length=255, blank=True)
    project_location = models.CharField(max_length=255, blank=True)
    total_mw = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    status = models.CharField(max_length=50, blank=True)
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        creating = self.pk is None
        super().save(*args, **kwargs)
        if creating and not self.project_code:
            self.project_code = f"PRJ{str(self.pk).zfill(3)}"
            super().save(update_fields=['project_code'])

    def __str__(self):
        return f"{self.project_name} ({self.project_code})"

    class Meta:
        db_table = 'project_master'


class ProjectWorkAllocation(models.Model):
    project = models.ForeignKey(ProjectMaster, on_delete=models.CASCADE, related_name='allocations')
    work_package = models.ForeignKey(WorkPackage, on_delete=models.SET_NULL, null=True, blank=True)
    vendor = models.ForeignKey(Vendor, on_delete=models.SET_NULL, null=True, blank=True)
    allocated_mw = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    completed_mw = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    timeline_start_date = models.DateField(null=True, blank=True)
    timeline_end_date = models.DateField(null=True, blank=True)
    actual_completion_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=50, blank=True)
    scope_note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'project_work_allocation'


class MaterialQuotation(models.Model):
    quotation_reference = models.CharField(max_length=120, blank=True)
    project_name = models.CharField(max_length=255, blank=True)
    client_name = models.CharField(max_length=255, blank=True)
    vendor = models.ForeignKey(Vendor, on_delete=models.SET_NULL, null=True, blank=True)
    work_type = models.CharField(max_length=150, blank=True)
    mw = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    file_type = models.CharField(max_length=20, blank=True)
    note = models.TextField(blank=True)
    line_items_json = models.TextField(blank=True)
    total_quantity = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    total_amount = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'material_quotation'


class ProjectPlanner(models.Model):
    business_unit = models.CharField(max_length=255, blank=True)
    project_name = models.CharField(max_length=255, blank=True)
    client_name = models.CharField(max_length=255, blank=True)
    procurement_source = models.CharField(max_length=100, blank=True)
    project_location = models.CharField(max_length=255, blank=True)
    mw = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    lead_vendor = models.ForeignKey(Vendor, on_delete=models.SET_NULL, null=True, blank=True)
    planner_note = models.TextField(blank=True)
    work_plan_json = models.TextField(blank=True)
    material_plan_json = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'project_planner'


class ProjectSite(models.Model):
    """One physical site inside a project.

    Capacity is held per site; the project's total_mw is the sanctioned figure
    those sites are checked against. A site cannot be released for execution
    until every mandatory row in its assessment is cleared.
    """

    SITE_PREFIX = 'SITE'

    LAND_TITLE_CHOICES = [
        ('allotment', 'Allotment letter · site owner'),
        ('lease', 'Registered lease deed'),
        ('freehold', 'Freehold · owned'),
        ('government', 'Government allotment'),
    ]
    MOUNTING_CHOICES = [
        ('ground_fixed', 'Ground mount · fixed tilt'),
        ('ground_tracker', 'Ground mount · single axis'),
        ('rooftop', 'Rooftop'),
        ('floating', 'Floating'),
    ]
    STATUS_NOT_STARTED = 'not_started'
    STATUS_IN_REVIEW = 'in_review'
    STATUS_CLEARED = 'cleared'
    STATUS_CHOICES = [
        (STATUS_NOT_STARTED, 'Not started'),
        (STATUS_IN_REVIEW, 'In review'),
        (STATUS_CLEARED, 'Cleared'),
    ]

    project = models.ForeignKey(ProjectMaster, on_delete=models.CASCADE, related_name='sites')
    site_code = models.CharField(max_length=50, unique=True, blank=True)
    site_name = models.CharField(max_length=255)
    capacity_mw = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    land_area_acres = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    mounting_type = models.CharField(max_length=30, choices=MOUNTING_CHOICES, blank=True)

    village = models.CharField(max_length=150, blank=True)
    tehsil = models.CharField(max_length=150, blank=True)
    district = models.CharField(max_length=150, blank=True)
    state = models.CharField(max_length=100, blank=True)
    latitude = models.DecimalField(max_digits=10, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=10, decimal_places=6, null=True, blank=True)
    khasra_numbers = models.CharField(max_length=255, blank=True)

    land_title = models.CharField(max_length=30, choices=LAND_TITLE_CHOICES, blank=True)
    owner_name = models.CharField(max_length=255, blank=True)
    tenure_years = models.PositiveIntegerField(null=True, blank=True)

    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default=STATUS_NOT_STARTED)
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        creating = self.pk is None
        super().save(*args, **kwargs)
        if creating:
            if not self.site_code:
                self.site_code = f"{self.SITE_PREFIX}-{str(self.pk).zfill(3)}"
                super().save(update_fields=['site_code'])
            self.seed_assessment()

    def seed_assessment(self):
        """Create the standard assessment file the first time a site is saved."""
        if self.assessments.exists():
            return
        # bulk_create skips save(), so is_mandatory is set explicitly here.
        SiteAssessment.objects.bulk_create([
            SiteAssessment(
                site=self,
                document_key=key,
                is_mandatory=mandatory,
                display_order=order,
            )
            for order, (key, _label, mandatory, _hint) in enumerate(SiteAssessment.DOCUMENT_SPEC)
        ])

    @property
    def mandatory_total(self):
        return self.assessments.filter(is_mandatory=True).count()

    @property
    def mandatory_cleared(self):
        return self.assessments.filter(
            is_mandatory=True, status=SiteAssessment.STATUS_CLEARED
        ).count()

    def recalculate_status(self, commit=True):
        """Roll the document rows up into the site's own status."""
        total = self.mandatory_total
        cleared = self.mandatory_cleared
        if total and cleared >= total:
            new_status = self.STATUS_CLEARED
        elif cleared or self.assessments.exclude(status=SiteAssessment.STATUS_PENDING).exists():
            new_status = self.STATUS_IN_REVIEW
        else:
            new_status = self.STATUS_NOT_STARTED
        if new_status != self.status:
            self.status = new_status
            if commit:
                super().save(update_fields=['status'])
        return self.status

    @property
    def is_cleared(self):
        return self.status == self.STATUS_CLEARED

    def __str__(self):
        return f"{self.site_name} ({self.site_code})"

    class Meta:
        db_table = 'project_site'
        ordering = ['site_code']


class SiteAssessment(models.Model):
    """One required document in a site's pre-execution assessment."""

    STATUS_PENDING = 'pending'
    STATUS_UPLOADED = 'uploaded'
    STATUS_CLEARED = 'cleared'
    STATUS_REJECTED = 'rejected'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'),
        (STATUS_UPLOADED, 'Awaiting sign-off'),
        (STATUS_CLEARED, 'Cleared'),
        (STATUS_REJECTED, 'Rejected'),
    ]

    # key, label, is_mandatory, hint
    DOCUMENT_SPEC = [
        ('site_clearance', 'Site Clearance Report', True,
         'Signed by the client'),
        ('land_title', 'Allotment Letter / Lease Deed', True,
         'Allotment letter from the owner, or a registered lease'),
        ('revenue_record', 'Revenue Record / Khasra', True,
         'Current year extract'),
        ('topography', 'Topography & Shading Survey', True,
         'Feeds the yield model'),
        ('grid_connectivity', 'Grid Connectivity Confirmation', True,
         'Feeder availability and evacuation point'),
        ('approach_road', 'Approach Road & Access', True,
         'Right of way for heavy vehicles'),
        ('geotech', 'Soil / Geotech Report', False,
         'Foundation design input'),
        ('water_source', 'Water Source Availability', False,
         'For module cleaning'),
    ]
    SPEC_BY_KEY = {key: (label, mandatory, hint) for key, label, mandatory, hint in DOCUMENT_SPEC}

    site = models.ForeignKey(ProjectSite, on_delete=models.CASCADE, related_name='assessments')
    document_key = models.CharField(max_length=50)
    is_mandatory = models.BooleanField(default=True)
    display_order = models.PositiveIntegerField(default=0)

    document_file = models.FileField(upload_to='site_assessment/', blank=True, null=True)
    file_name = models.CharField(max_length=255, blank=True)

    signed_by = models.CharField(max_length=255, blank=True)
    signed_on = models.DateField(null=True, blank=True)
    verified_by = models.CharField(max_length=255, blank=True)
    verified_on = models.DateField(null=True, blank=True)

    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default=STATUS_PENDING)
    remark = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        spec = self.SPEC_BY_KEY.get(self.document_key)
        if spec and self.pk is None:
            self.is_mandatory = spec[1]
        super().save(*args, **kwargs)

    @property
    def label(self):
        spec = self.SPEC_BY_KEY.get(self.document_key)
        return spec[0] if spec else self.document_key

    @property
    def hint(self):
        spec = self.SPEC_BY_KEY.get(self.document_key)
        return spec[2] if spec else ''

    def __str__(self):
        return f"{self.site.site_code} · {self.label}"

    class Meta:
        db_table = 'site_assessment'
        ordering = ['display_order', 'id']
        unique_together = [('site', 'document_key')]
