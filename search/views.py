import os
import json
from django.conf import settings
from .models import Document, ExistingDocument
from django.db.models import Q
from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse, HttpResponseBadRequest
from typing import List, Dict, Optional

INDEX_DIR = os.path.join(settings.BASE_DIR, 'vector_index')
MAPPING_FILE = os.path.join(INDEX_DIR, 'mapping.json')
INDEX_FILE = os.path.join(INDEX_DIR, 'faiss.index')

def detect_intent(query: str) -> str:
    q = (query or "").lower()

    # RFQ / Quotation
    if any(k in q for k in [
        "quotation", "quote", "rfq",
        "best price", "lowest price",
        "rate request"
    ]):
        return "rfq_inquiry"

    # Price Inquiry
    if any(k in q for k in [
        "price", "cost", "amount",
        "rate", "budget"
    ]):
        return "price_inquiry"

    # Quantity Inquiry
    if any(k in q for k in [
        "quantity", "qty", "how many",
        "stock", "inventory", "count"
    ]):
        return "quantity_inquiry"

    # Specification Inquiry
    if any(k in q for k in [
        "specification", "spec",
        "details", "description",
        "datasheet"
    ]):
        return "spec_inquiry"

    # Vendor Inquiry
    if any(k in q for k in [
        "vendor", "supplier",
        "contractor"
    ]):
        return "vendor_inquiry"

    # Purchase Order
    if any(k in q for k in [
        "po", "purchase order"
    ]):
        return "po_inquiry"

    # Invoice
    if any(k in q for k in [
        "invoice", "bill", "tax invoice"
    ]):
        return "invoice_inquiry"

    # Payment
    if any(k in q for k in [
        "payment", "paid", "pending payment",
        "advance", "balance"
    ]):
        return "payment_inquiry"

    # Project
    if any(k in q for k in [
        "project", "site", "location"
    ]):
        return "project_inquiry"

    # Document Search
    if any(k in q for k in [
        "document", "pdf", "file", 
        "contract", "agreement"
    ]):
        return "document_inquiry"

    return "search"
def hybrid_search(query: str, topk: int = 10) -> Dict:
    """Perform semantic (FAISS) + keyword (material_master) search and merge results."""
    intent = detect_intent(query)
    sem_results: List[Dict] = []
    kw_results: List[Dict] = []

    # semantic: try FAISS index mapping -> Document
    try:
        if os.path.exists(INDEX_FILE) and os.path.exists(MAPPING_FILE):
            from sentence_transformers import SentenceTransformer
            import numpy as np
            import faiss
            model = SentenceTransformer('all-MiniLM-L6-v2')
            qvec = model.encode([query], convert_to_numpy=True).astype('float32')
            index = faiss.read_index(INDEX_FILE)
            D, I = index.search(qvec, topk)
            with open(MAPPING_FILE, 'r', encoding='utf-8') as f:
                mapping = json.load(f)
            ids = [mapping.get(str(int(i))) for i in I[0] if str(int(i)) in mapping]
            preserved = [int(x) for x in ids if x]
            docs = list(Document.objects.filter(id__in=preserved))
            for d in docs:
                sem_results.append({'id': f'doc:{d.id}', 'title': d.title or '', 'file_path': d.file_path or '', 'snippet': (d.content or '')[:400], 'source': 'semantic'})
    except Exception:
        sem_results = []

    # keyword search on material_master
    try:
        from django.db import connection
        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT id, material_code, material_name, specification, qty
                FROM material_master
                WHERE material_name ILIKE %s OR specification ILIKE %s
                LIMIT %s
                """,
                [f'%{query}%', f'%{query}%', topk],
            )
            rows = cur.fetchall()
        for r in rows:
            kw_results.append({'id': f'mat:{r[0]}', 'title': r[2] or '', 'file_path': r[1] or '', 'snippet': (r[3] or '')[:400], 'qty': r[4], 'source': 'keyword'})
    except Exception:
        kw_results = []

    # merge: semantic first, then keyword excluding duplicates by title
    combined: List[Dict] = []
    seen = set()
    for r in sem_results:
        t = (r.get('title') or '').strip().lower()
        if t and t not in seen:
            combined.append(r)
            seen.add(t)
    for r in kw_results:
        t = (r.get('title') or '').strip().lower()
        if t and t not in seen:
            combined.append(r)
            seen.add(t)

    return {'intent': intent, 'results': combined}


def api_search(request):
    """JSON API for semantic search. Returns list of documents."""
    from django.http import JsonResponse
    query = request.GET.get('q') or ''
    if not query:
        return JsonResponse({'query': '', 'intent': None, 'results': []})

    out = hybrid_search(query, topk=20)
    return JsonResponse({'query': query, 'intent': out.get('intent'), 'results': out.get('results', [])})


@csrf_exempt
def api_chat(request):
    """Simple chat endpoint: accepts JSON {message: str} and returns a reply and matching documents."""
    if request.method != 'POST':
        return HttpResponseBadRequest('POST required')
    try:
        payload = json.loads(request.body.decode('utf-8') or '{}')
    except Exception:
        payload = {}
    message = (payload.get('message') or '').strip()
    if not message:
        return JsonResponse({'reply': 'Please send a message.', 'results': []})

    # Use hybrid search for chat as well
    out = hybrid_search(message, topk=5)
    results = out.get('results', [])
    intent = out.get('intent')

    if results:
        titles = ', '.join([r.get('title', '') for r in results[:3]])
        # build a richer reply depending on intent
        if intent == 'quantity_inquiry' and results and 'qty' in results[0]:
            reply = f'I found {len(results)} items. Example: {results[0].get("title")} has qty {results[0].get("qty")}.'
        else:
            reply = f'I found {len(results)} matching items. Top: {titles}.'
    else:
        reply = 'I could not find any documents matching that query.'

    return JsonResponse({'reply': reply, 'intent': intent, 'results': results})
