"""Stripe subscriptions for Kozzi plans (claimable sandbox, raw stripe SDK).

Checkout -> /payment/success polls /payments/status -> the subscription is synced onto the
user's doc. Webhooks keep it in sync afterwards (renewals, plan changes, cancellations)."""

import json
import logging
import os
import uuid
from datetime import datetime, timezone

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from starlette.concurrency import run_in_threadpool

from clerk_auth import require_user
from lib import core, plans
from lib.db import db
from lib.email import owner_email
from models.schemas import (
    Billing, ChangePlanIn, CheckoutIn, CheckoutOut, Invoice, PaymentStatus, PlanInfo, PlanLimits, PriceOption, Usage,
)

logger = logging.getLogger(__name__)
router = APIRouter()
stripe.api_key = os.environ.get("STRIPE_SECRET_KEY") or "sk_test_emergent"
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
# Digital SaaS + a GB sandbox account: Stripe manages tax and compliance ("full").
TAX_MODE = "full"


def _ts(v) -> datetime | None:
    return datetime.fromtimestamp(int(v), tz=timezone.utc) if v else None


async def _price(lookup_key: str):
    if lookup_key not in plans.PRICES:
        raise HTTPException(status_code=422, detail="Unknown plan")
    found = await run_in_threadpool(lambda: stripe.Price.list(lookup_keys=[lookup_key], active=True, limit=1).data)
    if not found:
        raise HTTPException(status_code=503, detail="That plan isn't available right now")
    return found[0]


async def _customer(user_id: str) -> str:
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "stripe_customer_id": 1})
    if user and user.get("stripe_customer_id"):
        return user["stripe_customer_id"]
    email = await owner_email(user_id)
    cust = await run_in_threadpool(lambda: stripe.Customer.create(email=email or None, metadata={"user_id": user_id}))
    await db.users.update_one({"user_id": user_id}, {"$set": {"stripe_customer_id": cust.id}}, upsert=True)
    return cust.id


async def sync_subscription(sub_id: str) -> None:
    """Copy a Stripe subscription's state onto the user it belongs to."""
    sub = await run_in_threadpool(lambda: stripe.Subscription.retrieve(sub_id))
    d = json.loads(str(sub))  # StripeObject -> plain nested dict
    item = (d.get("items") or {}).get("data", [{}])[0]
    lookup = (item.get("price") or {}).get("lookup_key") or ""
    user_id = (d.get("metadata") or {}).get("user_id")
    if not user_id:
        u = await db.users.find_one({"stripe_customer_id": d.get("customer")}, {"_id": 0, "user_id": 1})
        user_id = (u or {}).get("user_id")
    if not user_id or lookup not in plans.PRICES:
        logger.warning("subscription %s has no known user or price", sub_id)
        return
    plan, interval, _ = plans.PRICES[lookup]
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "plan_source": 1, "plan": 1})
    if user and user.get("plan_source") == "admin" and user.get("plan") == "enterprise":
        return  # an admin-granted Enterprise plan outranks a card subscription
    status = d.get("status", "")
    await db.users.update_one({"user_id": user_id}, {"$set": {
        "plan": plan if status in plans.ACTIVE_STRIPE else "free",
        "plan_interval": interval, "plan_status": status, "plan_source": "stripe",
        "plan_period_end": _ts(d.get("current_period_end") or item.get("current_period_end")),
        "cancel_at_period_end": bool(d.get("cancel_at_period_end")),
        "stripe_subscription_id": sub_id, "stripe_customer_id": d.get("customer"),
    }}, upsert=True)


async def _mark_paid(session_id: str, sub_id: str | None, pi_id: str | None) -> None:
    res = await db.payment_transactions.update_one(
        {"session_id": session_id, "payment_status": {"$ne": "paid"}},
        {"$set": {"status": "completed", "payment_status": "paid", "stripe_subscription_id": sub_id,
                  "stripe_payment_intent_id": pi_id, "updated_at": core.now()}},
    )
    # Update the DB first, then fulfil (plan access).
    if sub_id and res.modified_count:
        await sync_subscription(sub_id)


# ---------- billing page ----------

def _limits(name: str) -> PlanLimits:
    return PlanLimits(**{k: v for k, v in plans.PLANS[name].items() if k != "label"})


@router.get("/billing", response_model=Billing)
async def get_billing(user: dict = Depends(require_user)):
    uid = user["user_id"]
    doc = await db.users.find_one({"user_id": uid}, {"_id": 0}) or {}
    name = plans.effective_plan(doc)
    invoices: list[Invoice] = []
    if doc.get("stripe_customer_id"):
        try:
            data = await run_in_threadpool(lambda: stripe.Invoice.list(customer=doc["stripe_customer_id"], limit=24).data)
            invoices = [Invoice(
                id=i.id, number=i.number or "", amount=(i.amount_paid or i.amount_due or 0) / 100, currency=i.currency,
                status=i.status or "", created_at=_ts(i.created), hosted_url=i.hosted_invoice_url or "", pdf_url=i.invoice_pdf or "",
            ) for i in data]
        except stripe.error.StripeError as exc:
            logger.warning("invoice list failed: %s", exc)
    seats = 1 + await db.team_members.count_documents({"owner_id": uid})
    return Billing(
        plan=name, label=plans.PLANS[name]["label"], interval=doc.get("plan_interval", "") if name != "free" else "",
        status=doc.get("plan_status", ""), source=doc.get("plan_source", ""),
        period_end=core.aware(doc.get("plan_period_end")) if name != "free" else None,
        cancel_at_period_end=bool(doc.get("cancel_at_period_end")) and name != "free",
        has_subscription=bool(doc.get("stripe_subscription_id")) and doc.get("plan_status") in plans.ACTIVE_STRIPE,
        limits=_limits(name),
        usage=Usage(
            projects=await db.projects.count_documents({"owner_id": uid, **core.LIVE}),
            live=await db.projects.count_documents({"owner_id": uid, "published": True, **core.LIVE}),
            seats=seats,
        ),
        invoices=invoices,
        prices=[PriceOption(lookup_key=k, plan=p, interval=i, amount=a) for k, (p, i, a) in plans.PRICES.items()],
        plans=[PlanInfo(id=k, label=v["label"], limits=_limits(k)) for k, v in plans.PLANS.items()],
    )


@router.post("/billing/checkout", response_model=CheckoutOut)
async def checkout(body: CheckoutIn, user: dict = Depends(require_user)):
    uid = user["user_id"]
    doc = await db.users.find_one({"user_id": uid}, {"_id": 0}) or {}
    if doc.get("stripe_subscription_id") and doc.get("plan_status") in plans.ACTIVE_STRIPE:
        raise HTTPException(status_code=409, detail="You already have a subscription. Change plan instead.")
    price = await _price(body.lookup_key)
    origin = body.origin_url.rstrip("/")
    if not origin.startswith(("https://", "http://localhost")):
        raise HTTPException(status_code=422, detail="Invalid origin")
    customer = await _customer(uid)
    kwargs = dict(
        customer=customer,
        line_items=[{"price": price.id, "quantity": 1}],
        mode="subscription",
        success_url=f"{origin}/payment/success?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{origin}/payment/cancel",
        client_reference_id=uid,
        metadata={"user_id": uid, "lookup_key": body.lookup_key},
        subscription_data={"metadata": {"user_id": uid, "lookup_key": body.lookup_key}},
    )

    def create():
        if TAX_MODE == "full":
            try:
                return stripe.checkout.Session.create(**kwargs, managed_payments={"enabled": True})
            except stripe.error.InvalidRequestError as e:
                msg = (e.user_message or str(e) or "").lower()
                if "managed payments" in msg or "managed_payments" in msg or "ineligible" in msg:
                    return stripe.checkout.Session.create(**kwargs, automatic_tax={"enabled": True},
                                                          billing_address_collection="required", customer_update={"address": "auto"})
                raise
        return stripe.checkout.Session.create(**kwargs)

    try:
        session = await run_in_threadpool(create)
    except stripe.error.StripeError as exc:
        logger.error("checkout failed: %s", exc)
        raise HTTPException(status_code=503, detail="Couldn't start checkout. Try again in a moment.")
    await db.payment_transactions.insert_one({
        "id": str(uuid.uuid4()), "session_id": session.id, "user_id": uid, "lookup_key": body.lookup_key,
        "amount": float(price.unit_amount or 0) / 100, "currency": price.currency,
        "status": "initiated", "payment_status": "pending", "created_at": core.now(), "updated_at": core.now(),
    })
    return CheckoutOut(checkout_url=session.url, session_id=session.id)


@router.get("/payments/status/{session_id}", response_model=PaymentStatus)
async def payment_status(session_id: str):
    record = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if record.get("payment_status") != "paid":
        try:
            s = await run_in_threadpool(lambda: stripe.checkout.Session.retrieve(session_id))
            if s.payment_status == "paid" or s.status == "complete":
                await _mark_paid(session_id, s.subscription, s.payment_intent)
            elif s.status == "expired":
                await db.payment_transactions.update_one({"session_id": session_id}, {"$set": {"status": "expired", "payment_status": "expired"}})
            record = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
        except stripe.error.StripeError:
            pass
    return PaymentStatus(session_id=record["session_id"], status=record["status"], payment_status=record["payment_status"])


async def _subscription(uid: str) -> str:
    doc = await db.users.find_one({"user_id": uid}, {"_id": 0}) or {}
    if not doc.get("stripe_subscription_id") or doc.get("plan_status") not in plans.ACTIVE_STRIPE:
        raise HTTPException(status_code=409, detail="You don't have an active subscription")
    return doc["stripe_subscription_id"]


@router.post("/billing/change", response_model=Billing)
async def change_plan(body: ChangePlanIn, user: dict = Depends(require_user)):
    sub_id = await _subscription(user["user_id"])
    price = await _price(body.lookup_key)
    if plans.PRICES[body.lookup_key][0] == "pro" and await db.team_members.count_documents({"owner_id": user["user_id"]}):
        raise HTTPException(status_code=409, detail="Remove your teammates before moving to Pro")

    def modify():
        sub = stripe.Subscription.retrieve(sub_id)
        item_id = sub["items"]["data"][0]["id"]
        return stripe.Subscription.modify(sub_id, items=[{"id": item_id, "price": price.id}],
                                          proration_behavior="create_prorations", cancel_at_period_end=False,
                                          metadata={"user_id": user["user_id"], "lookup_key": body.lookup_key})
    try:
        await run_in_threadpool(modify)
    except stripe.error.StripeError as exc:
        logger.error("plan change failed: %s", exc)
        raise HTTPException(status_code=503, detail="Couldn't change the plan. Try again in a moment.")
    await sync_subscription(sub_id)
    return await get_billing(user)


async def _set_cancel(user: dict, value: bool) -> Billing:
    sub_id = await _subscription(user["user_id"])
    try:
        await run_in_threadpool(lambda: stripe.Subscription.modify(sub_id, cancel_at_period_end=value))
    except stripe.error.StripeError as exc:
        logger.error("cancel toggle failed: %s", exc)
        raise HTTPException(status_code=503, detail="Couldn't update the subscription. Try again in a moment.")
    await sync_subscription(sub_id)
    return await get_billing(user)


@router.post("/billing/cancel", response_model=Billing)
async def cancel(user: dict = Depends(require_user)):
    return await _set_cancel(user, True)


@router.post("/billing/resume", response_model=Billing)
async def resume(user: dict = Depends(require_user)):
    return await _set_cancel(user, False)


@router.post("/stripe/webhook")  # exact path: Stripe is registered to deliver to /api/stripe/webhook
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)
    except (stripe.error.SignatureVerificationError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid signature")
    obj, t = event["data"]["object"], event["type"]
    if t == "checkout.session.completed":
        await _mark_paid(obj["id"], obj.get("subscription"), obj.get("payment_intent"))
    elif t in ("customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"):
        await sync_subscription(obj["id"])
    elif t in ("invoice.paid", "invoice.payment_failed") and obj.get("subscription"):
        await sync_subscription(obj["subscription"])
    elif t == "checkout.session.expired":
        await db.payment_transactions.update_one({"session_id": obj["id"]}, {"$set": {"status": "expired", "payment_status": "expired", "updated_at": core.now()}})
    elif t == "charge.refunded":
        await db.payment_transactions.update_one({"stripe_payment_intent_id": obj.get("payment_intent")},
                                                 {"$set": {"status": "refunded", "payment_status": "refunded", "updated_at": core.now()}})
    return {"status": "ok"}
