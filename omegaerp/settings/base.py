import os
from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env(
    DEBUG=(bool, False),
    SECRET_KEY=(str, 'unsafe-development-secret-key'),
    ALLOWED_HOSTS=(list, ['127.0.0.1', 'localhost', 'testserver']),
    CSRF_TRUSTED_ORIGINS=(list, []),
    EMAIL_PORT=(int, 587),
    EMAIL_USE_TLS=(bool, True),
    EMAIL_USE_SSL=(bool, False),
)
environ.Env.read_env(BASE_DIR / '.env')

SECRET_KEY = env('SECRET_KEY')
DEBUG = env.bool('DEBUG', default=False)

ALLOWED_HOSTS = env.list('ALLOWED_HOSTS', default=['127.0.0.1', 'localhost', 'testserver'])
CSRF_TRUSTED_ORIGINS = env.list('CSRF_TRUSTED_ORIGINS', default=[])

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'accounts',
    'administration',
    'core',
    'vendors',
    'tasks',
    'permissions',
    'notifications',
    'audit_logs',
    'purchase_orders',
    'deliveries',
    'transport',
    'payments',
    'documents',
    'reports',
    'search',
    'solar_engine',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'administration.middleware.SessionActivityMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'omegaerp.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
                'permissions.context_processors.user_permissions_context',
            ],
        },
    },
]

WSGI_APPLICATION = 'omegaerp.wsgi.application'
ASGI_APPLICATION = 'omegaerp.asgi.application'

# Vercel's Neon integration exposes the Postgres connection string under one
# of several names depending on how the project was linked. Accept the common
# ones (in priority order) so production is never silently left on the
# ephemeral SQLite fallback — which resets every serverless invocation — just
# because only POSTGRES_URL was set instead of DATABASE_URL.
_DB_URL = (
    os.environ.get('DATABASE_URL')
    or os.environ.get('POSTGRES_URL')
    or os.environ.get('POSTGRES_PRISMA_URL')
    or os.environ.get('DATABASE_URL_UNPOOLED')
    or os.environ.get('POSTGRES_URL_NON_POOLING')
)
if _DB_URL:
    DATABASES = {'default': env.db_url_config(_DB_URL)}
else:
    DATABASES = {
        'default': env.db(
            'DATABASE_URL',
            default=f"sqlite:///{(BASE_DIR / 'db.sqlite3').as_posix()}",
        )
    }
DATABASES['default']['CONN_MAX_AGE'] = env.int('DB_CONN_MAX_AGE', default=60)
DATABASES['default']['CONN_HEALTH_CHECKS'] = env.bool('DB_CONN_HEALTH_CHECKS', default=True)

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = env('TIME_ZONE', default='UTC')
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
STATICFILES_DIRS = [BASE_DIR / 'static']
STATIC_ROOT = BASE_DIR / 'staticfiles'

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'
BLOB_READ_WRITE_TOKEN = env('BLOB_READ_WRITE_TOKEN', default='')
VERCEL_BLOB_ACCESS = env('VERCEL_BLOB_ACCESS', default='private')

STORAGES = {
    'default': {
        'BACKEND': 'django.core.files.storage.FileSystemStorage',
    },
    'staticfiles': {
        'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage',
    },
}

if BLOB_READ_WRITE_TOKEN:
    STORAGES['default'] = {
        'BACKEND': 'core.storage_backends.VercelPrivateMediaStorage',
    }

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

EMAIL_BACKEND = env('EMAIL_BACKEND', default='django.core.mail.backends.smtp.EmailBackend')
EMAIL_HOST = env('EMAIL_HOST', default='')
EMAIL_PORT = env.int('EMAIL_PORT', default=587)
EMAIL_HOST_USER = env('EMAIL_HOST_USER', default='')
EMAIL_HOST_PASSWORD = env('EMAIL_HOST_PASSWORD', default='')
EMAIL_USE_TLS = env.bool('EMAIL_USE_TLS', default=True)
EMAIL_USE_SSL = env.bool('EMAIL_USE_SSL', default=False)
DEFAULT_FROM_EMAIL = env('DEFAULT_FROM_EMAIL', default='webmaster@localhost')
SERVER_EMAIL = env('SERVER_EMAIL', default=DEFAULT_FROM_EMAIL)

# Shared bearer token the FieldTracker field portal uses to post daily
# progress into /api/solar/field/ingest/. Leave blank to disable field ingest.
FIELD_INGEST_TOKEN = env('FIELD_INGEST_TOKEN', default='')

OPENAI_API_KEY = env('OPENAI_API_KEY', default='')
THIRD_PARTY_API_KEY = env('THIRD_PARTY_API_KEY', default='')

# --- Razorpay (vendor onboarding-fee gateway) ---------------------------
# The onboarding fee is collected by emailing the vendor a Razorpay Payment
# Link; the vendor pays it out-of-band and a webhook reconciles the record, so
# registration is never blocked on payment. Leave the keys blank in dev to keep
# the gateway disabled: payments.gateway reports enabled=False and the Payment
# step hides the "send link" action. Set all three (test or live) in the
# environment to switch it on.
RAZORPAY_KEY_ID = env('RAZORPAY_KEY_ID', default='')
RAZORPAY_KEY_SECRET = env('RAZORPAY_KEY_SECRET', default='')
RAZORPAY_WEBHOOK_SECRET = env('RAZORPAY_WEBHOOK_SECRET', default='')
# Onboarding fee charged per vendor registration, in major currency units
# (e.g. 2500 = ₹2,500.00). Set to 0 to disable the fee even when keys exist.
VENDOR_REGISTRATION_FEE = env.int('VENDOR_REGISTRATION_FEE', default=2500)
VENDOR_REGISTRATION_FEE_CURRENCY = env('VENDOR_REGISTRATION_FEE_CURRENCY', default='INR')

# Company (receiving) bank account for the onboarding fee. Shown on the vendor
# list next to the payment link so a vendor can pay the fee by direct bank
# transfer / UPI as an alternative to the Razorpay hosted link. All non-secret;
# leave blank to hide the "pay by bank transfer" panel entirely.
COMPANY_BANK_ACCOUNT_NAME = env('COMPANY_BANK_ACCOUNT_NAME', default='')
COMPANY_BANK_ACCOUNT_NUMBER = env('COMPANY_BANK_ACCOUNT_NUMBER', default='')
COMPANY_BANK_IFSC = env('COMPANY_BANK_IFSC', default='')
COMPANY_BANK_NAME = env('COMPANY_BANK_NAME', default='')
COMPANY_BANK_BRANCH = env('COMPANY_BANK_BRANCH', default='')
COMPANY_BANK_UPI = env('COMPANY_BANK_UPI', default='')

SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
SECURE_REFERRER_POLICY = 'same-origin'
SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_HTTPONLY = False
