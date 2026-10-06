from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0004_materialmaster_gst_percentage_and_more"),
    ]

    operations = [
        migrations.DeleteModel(name="ProjectPlanner"),
    ]
