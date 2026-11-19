"""Dev helper: creates (or reuses) a Clerk test user and prints a 10-minute session token
and a sign-in ticket. Usage: cd /app/backend && python tests/clerk_token.py [email]"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
SK = os.environ["CLERK_SECRET_KEY"]


def bapi(path, body=None, method="POST"):
    req = urllib.request.Request(
        "https://api.clerk.com/v1" + path,
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={"Authorization": "Bearer " + SK, "Content-Type": "application/json", "User-Agent": "emergent-test"},
    )
    return json.load(urllib.request.urlopen(req))


email = sys.argv[1] if len(sys.argv) > 1 else "builder+clerk_test@example.com"
found = bapi("/users?" + urllib.parse.urlencode({"email_address": email}), method="GET")
user = found[0] if found else bapi("/users", {"email_address": [email], "password": "Kozzi-test-12345!", "skip_password_checks": True, "first_name": "Test"})
session = bapi("/sessions", {"user_id": user["id"]})
token = bapi(f"/sessions/{session['id']}/tokens", {"expires_in_seconds": 600})["jwt"]
ticket = bapi("/sign_in_tokens", {"user_id": user["id"], "expires_in_seconds": 600})["token"]
print(json.dumps({"user_id": user["id"], "token": token, "ticket": ticket}))
