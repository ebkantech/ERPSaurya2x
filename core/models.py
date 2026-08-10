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
