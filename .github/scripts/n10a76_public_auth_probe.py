#!/usr/bin/env python3
"""N10-A7.6 Staging Auth metadata + OAuth START only. Never uses user credentials.
Outputs booleans/status only, never redirects with account credentials or records tokens.
"""
import json
import re
import pathlib
import urllib.request
import urllib.parse
import urllib.error
from urllib.parse import urlparse

STAGING = "https://ldivswlhtgmznzwhzsoi.supabase.co"
REDIRECT = "https://myintmoehein0115024.github.io/MMHVAULT-Auth-QA/n10a75-real-jwt-owner-qa.html"
page = pathlib.Path("n10a75-real-jwt-owner-qa.html").read_text(encoding="utf-8")
match = re.search(r"const PUBLIC_KEY\s*=\s*['\"](sb_publishable_[\w-]+)['\"]", page)
if not match:
    raise SystemExit("BLOCKED: public staging key missing or wrong page")
key = match.group(1)
headers = {"apikey": key, "Accept": "application/json", "User-Agent":"MMHVAULT-N10-A7.6-QA"}
print("TARGET_STAGE_ONLY", STAGING.endswith("ldivswlhtgmznzwhzsoi.supabase.co"))
req=urllib.request.Request(STAGING + "/auth/v1/settings",headers=headers)
with urllib.request.urlopen(req, timeout=18) as response:
    data=json.loads(response.read(200000))
    print("AUTH_SETTINGS_HTTP", response.status)
providers = data.get("external",{})
print("GOOGLE_PROVIDER_ENABLED",providers.get("google","not_exposed"))
print("EMAIL_PROVIDER_ENABLED",providers.get("email","not_exposed"))
for k in ("disable_signup","mailer_autoconfirm","security_captcha_enabled","security_captcha_provider","security_update_password_require_reauthentication"):
    print("AUTH_SETTING",k,str(data.get(k,"not_exposed")).lower())
# Test OAuth endpoint negotiation; never follow redirect or complete Google sign-in.
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, hdrs, newurl):
        return None
challenge="B"*43  # dummy PKCE challenge, just to inspect the initial HTTP handshake
url=STAGING+"/auth/v1/authorize?"+urllib.parse.urlencode({
    "provider":"google","redirect_to":REDIRECT,
    "code_challenge":challenge,"code_challenge_method":"s256"
})
try:
    urllib.request.build_opener(NoRedirect()).open(urllib.request.Request(url, headers=headers), timeout=18)
    status=200
    loc=""
except urllib.error.HTTPError as e:
    status=e.code
    loc=e.headers.get("Location","")
host=urlparse(loc).hostname or ""
print("GOOGLE_AUTHORIZE_STATUS",status)
print("GOOGLE_AUTHORIZE_REDIRECT_HOST_ALLOWED",host in ("accounts.google.com","accounts.youtube.com"))
print("EXPECTED_RETURN_URL",REDIRECT)
print("NOTE: Google redirect allowlist and final OAuth callback require interactive consent; a 302 alone does not prove allowlist.")
if data.get("external",{}).get("google") is not True:
    raise SystemExit("FAIL: Staging Google provider not enabled")
if status not in (302,303) or host not in ("accounts.google.com","accounts.youtube.com"):
    raise SystemExit("FAIL: Google OAuth initial handshake failed")
print("N10A76_PUBLIC_AUTH_PREFLIGHT PASS")
