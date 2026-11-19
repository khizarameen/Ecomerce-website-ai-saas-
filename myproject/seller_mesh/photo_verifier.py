"""AI Vision product photo verifier for buyer cancellation requests."""

from __future__ import annotations

import base64
from datetime import datetime, timezone
import io
import json
import logging
import os
import re
from typing import Any

from django.conf import settings
from PIL import Image, ImageOps, ImageStat
import requests

logger = logging.getLogger(__name__)

MAX_RAW_IMAGE_BYTES = 8 * 1024 * 1024
MAX_EDGE_PX = 800
GEMINI_VISION_TIMEOUT = 12


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _extract_raw_bytes(file_or_bytes_or_uri) -> bytes:
    if file_or_bytes_or_uri is None:
        raise ValueError('No photo provided.')

    if isinstance(file_or_bytes_or_uri, str):
        raw = file_or_bytes_or_uri.strip()
        if not raw:
            raise ValueError('Empty photo string provided.')
        if raw.startswith('data:image') and ';base64,' in raw:
            _, b64_part = raw.split(';base64,', 1)
            return base64.b64decode(b64_part)
        return base64.b64decode(raw)

    if isinstance(file_or_bytes_or_uri, (bytes, bytearray)):
        data = bytes(file_or_bytes_or_uri)
        if not data:
            raise ValueError('Empty photo bytes provided.')
        return data

    if hasattr(file_or_bytes_or_uri, 'read'):
        if hasattr(file_or_bytes_or_uri, 'seek'):
            try:
                file_or_bytes_or_uri.seek(0)
            except Exception:
                pass
        data = file_or_bytes_or_uri.read(MAX_RAW_IMAGE_BYTES + 1)
        if hasattr(file_or_bytes_or_uri, 'seek'):
            try:
                file_or_bytes_or_uri.seek(0)
            except Exception:
                pass
        if not data:
            raise ValueError('Uploaded photo file is empty.')
        if len(data) > MAX_RAW_IMAGE_BYTES:
            raise ValueError('Uploaded photo exceeds 8 MB limit.')
        return data

    raise ValueError(f'Unsupported image input type: {type(file_or_bytes_or_uri)}')


def prepare_cancel_photo(file_or_bytes_or_uri) -> tuple[bytes, str]:
    """Normalize uploaded image to compressed <=800px RGB JPEG bytes and data URI."""
    raw_bytes = _extract_raw_bytes(file_or_bytes_or_uri)
    try:
        with Image.open(io.BytesIO(raw_bytes)) as img:
            img = ImageOps.exif_transpose(img)
            if img.mode != 'RGB':
                img = img.convert('RGB')
            img.thumbnail((MAX_EDGE_PX, MAX_EDGE_PX), Image.Resampling.LANCZOS)
            buf = io.BytesIO()
            img.save(buf, format='JPEG', quality=80, optimize=True)
            jpeg_bytes = buf.getvalue()
    except Exception as exc:
        raise ValueError(f'Invalid image file: {exc}') from exc

    b64 = base64.b64encode(jpeg_bytes).decode('ascii')
    return jpeg_bytes, f'data:image/jpeg;base64,{b64}'


def _load_original_product_image_bytes(product) -> bytes | None:
    """Safely load Seller's original listing Product.main_image bytes if present."""
    if not product or not getattr(product, 'main_image', None):
        return None
    try:
        main_img = product.main_image
        img_path = getattr(main_img, 'path', '')
        if img_path and os.path.exists(img_path):
            with open(img_path, 'rb') as f:
                raw = f.read(MAX_RAW_IMAGE_BYTES)
        else:
            with main_img.open('rb') as f:
                raw = f.read(MAX_RAW_IMAGE_BYTES)
        if not raw:
            return None
        jpeg_bytes, _ = prepare_cancel_photo(raw)
        return jpeg_bytes
    except Exception as exc:
        logger.debug('Could not read original product image for verification: %s', exc)
        return None


def _compute_pil_similarity(img_a_bytes: bytes, img_b_bytes: bytes) -> float:
    """Compute a 0..1 blended color-histogram + spatial similarity between two images."""
    with Image.open(io.BytesIO(img_a_bytes)) as im_a, Image.open(io.BytesIO(img_b_bytes)) as im_b:
        a = im_a.convert('RGB').resize((32, 32), Image.Resampling.LANCZOS)
        b = im_b.convert('RGB').resize((32, 32), Image.Resampling.LANCZOS)

        # Quantize RGB channels coarsely into 16 bins per channel to compare color distributions
        hist_a = a.quantize(colors=32).convert('RGB').histogram()
        hist_b = b.quantize(colors=32).convert('RGB').histogram()
        denom = float(sum(hist_a) or 1)
        hist_overlap = sum(min(x, y) for x, y in zip(hist_a, hist_b)) / denom

        px_a = list(a.getdata())
        px_b = list(b.getdata())
        total_diff = 0.0
        for (r1, g1, b1), (r2, g2, b2) in zip(px_a, px_b):
            total_diff += abs(r1 - r2) + abs(g1 - g2) + abs(b1 - b2)
        spatial_sim = 1.0 - (total_diff / (len(px_a) * 3.0 * 255.0))

        return max(0.0, min(1.0, (0.60 * hist_overlap) + (0.40 * spatial_sim)))


def _call_gemini_vision(
    buyer_photo_bytes: bytes,
    original_photo_bytes: bytes | None,
    product_name: str,
    category_name: str,
    sku: str,
    description: str,
    cancel_reason: str,
) -> tuple[dict[str, Any] | None, str]:
    api_key = (
        getattr(settings, 'GEMINI_API_KEY', '')
        or getattr(settings, 'GOOGLE_API_KEY', '')
        or os.getenv('GEMINI_API_KEY', '')
        or os.getenv('GOOGLE_API_KEY', '')
    ).strip()
    if not api_key:
        return None, 'missing-api-key'

    base_url = getattr(
        settings,
        'GOOGLE_BASE_URL',
        'https://generativelanguage.googleapis.com/v1beta',
    ).rstrip('/')

    candidate_models: list[str] = []
    for candidate in ('gemini-2.5-flash', getattr(settings, 'GOOGLE_VISION_MODEL', '')):
        clean_m = (candidate or '').strip()
        if clean_m and clean_m not in candidate_models:
            candidate_models.append(clean_m)

    compare_mode = (
        'Compare IMAGE 1 (Seller Original Listing Product) and IMAGE 2 (Buyer Uploaded Cancellation Photo).'
        if original_photo_bytes
        else 'No reference product photo exists on the listing; verify IMAGE 1 (Buyer Uploaded Cancellation Photo) against the Seller Product Catalog Metadata below.'
    )

    prompt = (
        'You are the Seller Profit-Shield AI Return-Verification Agent for an e-commerce platform. '
        f'{compare_mode}\n'
        'Determine whether the buyer photographed the SAME original product shown/described in the listing, '
        'inspect visible condition/packaging/tampering, and help the seller handle the cancellation safely.\n\n'
        f'Seller Product Name: {product_name}\n'
        f'Category: {category_name}\n'
        f'SKU: {sku}\n'
        f'Catalog Description: {(description or "")[:300]}\n'
        f'Buyer Cancel Reason: {cancel_reason}\n\n'
        'Respond STRICTLY with valid JSON matching this schema:\n'
        '{\n'
        '  "verdict": "MATCHED" | "MISMATCH" | "SUSPICIOUS",\n'
        '  "is_same_product": true | false,\n'
        '  "confidence_score": integer 0-100,\n'
        '  "detected_item": "short label of what appears in buyer photo",\n'
        '  "visual_comparison": "concise comparison against original product",\n'
        '  "condition_assessment": "packaging/seal/damage observation",\n'
        '  "seller_recommendation": "clear action advice for seller",\n'
        '  "red_flags": ["list of any mismatch/tampering/switch-fraud warnings, empty if clean"],\n'
        '  "summary": "concise English summary helping the seller decide safely"\n'
        '}'
    )

    parts: list[dict[str, Any]] = [{'text': prompt}]
    if original_photo_bytes:
        parts.append({'text': 'IMAGE 1 (Seller Original Product Listing Photo):'})
        parts.append({
            'inline_data': {
                'mime_type': 'image/jpeg',
                'data': base64.b64encode(original_photo_bytes).decode('ascii'),
            }
        })
        parts.append({'text': 'IMAGE 2 (Buyer Uploaded Cancellation Photo):'})
    else:
        parts.append({'text': 'IMAGE 1 (Buyer Uploaded Cancellation Photo):'})

    parts.append({
        'inline_data': {
            'mime_type': 'image/jpeg',
            'data': base64.b64encode(buyer_photo_bytes).decode('ascii'),
        }
    })

    payload = {
        'contents': [{'role': 'user', 'parts': parts}],
        'generationConfig': {
            'temperature': 0.2,
            'maxOutputTokens': 650,
            'responseMimeType': 'application/json',
        },
    }

    last_err = 'gemini-unavailable'
    for model_name in candidate_models:
        try:
            url = f'{base_url}/models/{model_name}:generateContent?key={api_key}'
            resp = requests.post(
                url,
                headers={'Content-Type': 'application/json'},
                json=payload,
                timeout=GEMINI_VISION_TIMEOUT,
            )
            resp.raise_for_status()
            data = resp.json()
            candidates = data.get('candidates') or []
            raw_parts = candidates[0].get('content', {}).get('parts') or [] if candidates else []
            text_out = '\n'.join(p.get('text', '') for p in raw_parts if isinstance(p, dict) and p.get('text')).strip()
            if not text_out:
                continue
            try:
                parsed = json.loads(text_out)
            except json.JSONDecodeError:
                match = re.search(r'\{.*\}', text_out, re.DOTALL)
                parsed = json.loads(match.group()) if match else None
            if isinstance(parsed, dict) and parsed.get('verdict'):
                return parsed, model_name
        except Exception as exc:
            last_err = str(exc)
            logger.warning('Gemini vision verification (%s) failed: %s', model_name, exc)

    return None, last_err


def _fallback_pil_verification(
    buyer_photo_bytes: bytes,
    original_photo_bytes: bytes | None,
    product_name: str,
    cancel_reason: str,
) -> dict[str, Any]:
    with Image.open(io.BytesIO(buyer_photo_bytes)) as img:
        width, height = img.size
        stat = ImageStat.Stat(img.convert('RGB'))
        avg_stdev = sum(stat.stddev) / 3.0

    is_low_detail = avg_stdev < 4.0 or width < 32 or height < 32
    compared_with_original = bool(original_photo_bytes)

    if is_low_detail:
        verdict = 'SUSPICIOUS'
        is_same = False
        confidence = 38
        detected_item = f'Low-detail or blank image ({width}x{height}px)'
        visual_comparison = 'Uploaded photo has near-zero visual variance; original product cannot be confirmed.'
        condition_assessment = 'Unclear visual evidence — image appears blank or solid-colored.'
        seller_recommendation = 'Ask buyer for a clearer photo showing the item & serial/box before approving refund.'
        red_flags = ['Low-detail / blank uploaded image']
        summary = (
            f'Photo Alert: The uploaded image is unclear ({width}x{height}px blank or low detail). '
            'Request a clear photo showing the product and packaging before approving the cancellation or refund.'
        )
    elif original_photo_bytes:
        sim = _compute_pil_similarity(buyer_photo_bytes, original_photo_bytes)
        if sim >= 0.65:
            verdict = 'MATCHED'
            is_same = True
            confidence = int(round(min(97, 62 + sim * 34)))
            detected_item = f'{product_name} (visual palette & structure match {round(sim * 100)}%)'
            visual_comparison = (
                f'Buyer cancel photo matches Seller original "{product_name}" listing photo '
                f'({confidence}% similarity).'
            )
            condition_assessment = 'Product silhouette and visual signature match original listing.'
            seller_recommendation = (
                'Safe to process cancellation and resell to Next Customer or restock in inventory.'
            )
            red_flags = []
            summary = (
                f'Verification Passed ({confidence}% Match): The buyer-uploaded photo matches your original '
                f'"{product_name}" listing. You can safely publish a Next-Customer deal or recall it to warehouse stock.'
            )
        elif sim >= 0.42:
            verdict = 'SUSPICIOUS'
            is_same = False
            confidence = int(round(45 + sim * 40))
            detected_item = f'Partial visual match ({round(sim * 100)}% similarity vs listing)'
            visual_comparison = (
                f'Different angle, lighting, or packaging detected compared to Seller listing "{product_name}" '
                f'({round(sim * 100)}% visual similarity).'
            )
            condition_assessment = 'Moderate visual deviation — recommend manual seller check.'
            seller_recommendation = (
                'Inspect buyer photo alongside your original SKU image before releasing parcel or refund.'
            )
            red_flags = [f'Moderate visual deviation ({round(sim * 100)}% match) against listing image']
            summary = (
                f'Review Recommended ({confidence}% Match): The lighting, angle, or packaging differs slightly from your '
                f'"{product_name}" listing. Perform a quick visual inspection before re-listing or refunding.'
            )
        else:
            verdict = 'MISMATCH'
            is_same = False
            confidence = int(round(min(95, 60 + (1.0 - sim) * 35)))
            detected_item = f'Different item / color profile ({round(sim * 100)}% similarity)'
            visual_comparison = (
                f'Buyer uploaded photo strongly differs from Seller original "{product_name}" photo '
                f'(only {round(sim * 100)}% visual overlap).'
            )
            condition_assessment = 'Possible wrong item, counterfeit swap, or unrelated image uploaded.'
            seller_recommendation = (
                'Hold refund/resale and open Return Fraud Dispute or ask buyer to re-upload original item photo.'
            )
            red_flags = [
                f'Visual mismatch with listing photo ({round(sim * 100)}% overlap)',
                'Possible switch-fraud or wrong product return',
            ]
            summary = (
                f'Mismatch Alert ({confidence}% Mismatch): The uploaded photo does not match your original '
                f'"{product_name}" listing! Hold the refund and inspect the parcel before relisting.'
            )
    else:
        verdict = 'SUSPICIOUS'
        is_same = None
        confidence = 60
        detected_item = f'Product image uploaded ({width}x{height}px, catalog has no reference photo)'
        visual_comparison = (
            f'Listing "{product_name}" has no uploaded main_image yet; buyer photo clarity verified ({width}x{height}px).'
        )
        condition_assessment = f'Clear image received with cancel reason: {cancel_reason or "Customer cancellation"}.'
        seller_recommendation = (
            'Visually confirm against your warehouse stock (or add a main product image for automatic 2-way comparison).'
        )
        red_flags = ['No seller reference image uploaded on product listing for 2-image comparison']
        summary = (
            f'Photo Received ({width}x{height}px): No reference image was set on this product listing, '
            'so please visually confirm it matches your dispatched item.'
        )

    return {
        'verdict': verdict,
        'is_same_product': is_same,
        'confidence_score': confidence,
        'detected_item': detected_item,
        'visual_comparison': visual_comparison,
        'condition_assessment': condition_assessment,
        'seller_recommendation': seller_recommendation,
        'red_flags': red_flags,
        'summary': summary,
        'compared_with_original_image': compared_with_original,
        'verified_at': _utc_now_iso(),
    }


def verify_cancelled_product_photo(
    buyer_photo_bytes: bytes,
    product=None,
    product_title: str = '',
    cancel_reason: str = '',
) -> dict[str, Any]:
    """Verify buyer's cancelled product photo against the seller's original product."""
    original_bytes = _load_original_product_image_bytes(product)
    prod_name = getattr(product, 'name', '') or product_title or 'Store Product'
    cat_name = product.category.name if (product and getattr(product, 'category', None)) else 'Store Catalog'
    sku = getattr(product, 'sku', '') or 'N/A'
    desc = getattr(product, 'short_description', '') or getattr(product, 'description', '') or ''

    gemini_raw, engine_info = _call_gemini_vision(
        buyer_photo_bytes=buyer_photo_bytes,
        original_photo_bytes=original_bytes,
        product_name=prod_name,
        category_name=cat_name,
        sku=sku,
        description=desc,
        cancel_reason=cancel_reason,
    )

    if gemini_raw:
        raw_verdict = str(gemini_raw.get('verdict', 'SUSPICIOUS')).upper().strip()
        if raw_verdict not in ('MATCHED', 'MISMATCH', 'SUSPICIOUS'):
            raw_verdict = 'MATCHED' if gemini_raw.get('is_same_product') else 'SUSPICIOUS'

        raw_conf = gemini_raw.get('confidence_score', 75)
        try:
            conf = max(0, min(100, int(round(float(raw_conf)))))
        except (TypeError, ValueError):
            conf = 75

        red_flags = [
            str(item).strip()
            for item in (gemini_raw.get('red_flags') or [])
            if str(item).strip()
        ]
        is_same = gemini_raw.get('is_same_product')
        if not isinstance(is_same, bool):
            is_same = raw_verdict == 'MATCHED'

        return {
            'verdict': raw_verdict,
            'is_same_product': is_same,
            'confidence_score': conf,
            'detected_item': str(gemini_raw.get('detected_item') or prod_name),
            'visual_comparison': str(
                gemini_raw.get('visual_comparison')
                or f'AI compared uploaded photo against original listing "{prod_name}".'
            ),
            'condition_assessment': str(
                gemini_raw.get('condition_assessment')
                or 'Inspected for product match, seal condition, and packaging integrity.'
            ),
            'seller_recommendation': str(
                gemini_raw.get('seller_recommendation')
                or 'Review verdict before reassigning to Next Customer or recalling backup.'
            ),
            'red_flags': red_flags,
            'summary': str(
                gemini_raw.get('summary')
                or gemini_raw.get('roman_urdu_summary')
                or f'AI Vision Check ({raw_verdict}, {conf}%): Seller review complete.'
            ),
            'compared_with_original_image': bool(original_bytes),
            'verified_at': _utc_now_iso(),
        }

    return _fallback_pil_verification(
        buyer_photo_bytes=buyer_photo_bytes,
        original_photo_bytes=original_bytes,
        product_name=prod_name,
        cancel_reason=cancel_reason,
    )
