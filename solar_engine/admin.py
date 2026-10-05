from django.contrib import admin

from .models import (
    BoqSection,
    BoqTemplate,
    BoqTemplateItem,
    ComponentSpecSet,
    ProjectBoqItem,
    ProjectBuild,
    ProjectSizing,
    ProjectStage,
    ProjectWorkPackage,
    WbsStage,
    WbsTemplate,
    WbsWorkPackage,
)


@admin.register(ComponentSpecSet)
class ComponentSpecSetAdmin(admin.ModelAdmin):
    list_display = ('name', 'is_default', 'is_active', 'module_wp', 'modules_per_string',
                    'inverter_kw', 'transformer_mva', 'target_dc_ac_ratio')
    list_filter = ('is_default', 'is_active')


class WbsStageInline(admin.TabularInline):
    model = WbsStage
    extra = 0


class WbsWorkPackageInline(admin.TabularInline):
    model = WbsWorkPackage
    extra = 0


@admin.register(WbsTemplate)
class WbsTemplateAdmin(admin.ModelAdmin):
    list_display = ('name', 'project_type', 'is_default', 'is_active')
    list_filter = ('project_type', 'is_default', 'is_active')
    inlines = [WbsStageInline]


@admin.register(WbsStage)
class WbsStageAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'template', 'order', 'is_parallel')
    list_filter = ('template',)
    inlines = [WbsWorkPackageInline]


class BoqSectionInline(admin.TabularInline):
    model = BoqSection
    extra = 0


class BoqTemplateItemInline(admin.TabularInline):
    model = BoqTemplateItem
    extra = 0


@admin.register(BoqTemplate)
class BoqTemplateAdmin(admin.ModelAdmin):
    list_display = ('name', 'project_type', 'is_default', 'is_active')
    list_filter = ('project_type', 'is_default', 'is_active')
    inlines = [BoqSectionInline]


@admin.register(BoqSection)
class BoqSectionAdmin(admin.ModelAdmin):
    list_display = ('name', 'template', 'order', 'is_material')
    list_filter = ('template', 'is_material')
    inlines = [BoqTemplateItemInline]


class ProjectStageInline(admin.TabularInline):
    model = ProjectStage
    extra = 0


class ProjectBoqItemInline(admin.TabularInline):
    model = ProjectBoqItem
    extra = 0


@admin.register(ProjectBuild)
class ProjectBuildAdmin(admin.ModelAdmin):
    list_display = ('project', 'project_type', 'ac_capacity_mw', 'status', 'locked_at')
    list_filter = ('project_type', 'status')
    search_fields = ('project__project_name', 'project__project_code')
    inlines = [ProjectStageInline, ProjectBoqItemInline]


admin.site.register(ProjectSizing)
admin.site.register(ProjectStage)
admin.site.register(ProjectWorkPackage)
admin.site.register(ProjectBoqItem)
