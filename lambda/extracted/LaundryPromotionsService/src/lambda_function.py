"""
LaundryPromotionsService — promo CRUD and usage tracking.
Migrated to PostgreSQL. Note: this service previously used a separate Promotions
DynamoDB table. Now all promos live in shop.promotions.
"""
import json
import logging
import uuid
from datetime import datetime
from decimal import Decimal
import db

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def decimal_serializer(obj):
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Type {type(obj)} not serializable")


def generate_promo_code(promotion_name):
    uuid_part = str(uuid.uuid4())[:2].upper()
    name_part = ''.join(filter(str.isalnum, promotion_name)).upper()[:2]
    return f"{name_part}{uuid_part}"


def view_all_promotions():
    try:
        cur = db.get_cursor()
        cur.execute("""
            SELECT promotion_id, laundry_id, promo_code, promo_name, description,
                   discount_type, discount_value, apply_on_whole_order, customer_type,
                   minimum_order_value, usage_limit_per_customer,
                   is_online_frequency_promo, linked_frequency,
                   start_date, end_date, is_active, created_at
            FROM shop.promotions ORDER BY promotion_id
        """)
        rows = [dict(r) for r in cur.fetchall()]
        return {'statusCode': 200, 'body': {'promotions': rows}}
    except Exception as e:
        return {'statusCode': 500, 'body': json.dumps({'message': str(e)})}


def validate_promo_code(promo_code, laundry_id):
    try:
        cur = db.get_cursor()
        cur.execute("""
            SELECT * FROM shop.promotions
            WHERE promo_code = %s AND laundry_id = %s
        """, (promo_code, laundry_id))
        promo = cur.fetchone()
        if not promo:
            return {'isValid': False, 'message': 'Promotion not found.'}
        if not promo['is_active']:
            return {'isValid': False, 'message': 'Promotion is not active.'}
        today = datetime.utcnow().date()
        if promo['start_date'] and today < promo['start_date']:
            return {'isValid': False, 'message': 'Promotion has not started yet.'}
        if promo['end_date'] and today > promo['end_date']:
            return {'isValid': False, 'message': 'Promotion has expired.'}
        return {'isValid': True, 'promotion': dict(promo)}
    except Exception as e:
        return {'isValid': False, 'message': str(e)}


def update_promo_usage(customer_id, promo_code, order_id, laundry_id, promotion):
    try:
        cur = db.get_cursor()
        promotion_id = promotion.get('promotion_id') or promotion.get('promotionId')

        # Check usage limit
        cur.execute("""
            SELECT usage_count FROM orders.customer_promo_usage
            WHERE customer_id = %s AND laundry_id = %s AND promotion_id = %s
        """, (customer_id, laundry_id, promotion_id))
        row = cur.fetchone()
        usage_limit = promotion.get('usage_limit_per_customer') or promotion.get('usageLimitPerCustomer', 1)

        if row and row['usage_count'] >= usage_limit:
            return {'statusCode': 400, 'message': 'Usage limit exceeded for this promo code.'}

        cur.execute("""
            INSERT INTO orders.customer_promo_usage
                (customer_id, laundry_id, promotion_id, promo_code, usage_count, last_used_at)
            VALUES (%s,%s,%s,%s,1,NOW())
            ON CONFLICT (customer_id, laundry_id, promotion_id) DO UPDATE SET
                usage_count = orders.customer_promo_usage.usage_count + 1,
                last_used_at = NOW()
        """, (customer_id, laundry_id, promotion_id, promo_code))

        cur.execute("""
            INSERT INTO orders.customer_promo_usage_history (customer_id, promotion_id, order_id, used_at)
            VALUES (%s,%s,%s,NOW())
        """, (customer_id, promotion_id, order_id))

        db.commit()
        return {'statusCode': 200, 'message': 'Promo usage updated successfully.'}
    except Exception as e:
        db.rollback()
        logger.exception("update_promo_usage error")
        return {'statusCode': 500, 'message': str(e)}


def update_promotions(update_data):
    """Add/edit/delete promotions. Requires laundry_id in each promo entry."""
    results = {'added': [], 'deleted': [], 'edited': [], 'errors': []}
    try:
        cur = db.get_cursor()

        for promo in update_data.get('promotions_to_add', []):
            try:
                laundry_id = promo.get('laundryId') or (promo.get('laundries', [None])[0])
                promo_code = generate_promo_code(promo['promotionName'])
                cur.execute("""
                    INSERT INTO shop.promotions (
                        laundry_id, promo_code, promo_name, description,
                        discount_type, discount_value, apply_on_whole_order,
                        minimum_order_value, usage_limit_per_customer, is_active,
                        start_date, end_date
                    ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT (laundry_id, promo_code) DO NOTHING
                """, (
                    laundry_id, promo_code, promo['promotionName'],
                    promo.get('promotionDescription'), promo['discountType'],
                    promo['discountValue'], promo.get('applyOnWholeOrder', True),
                    promo.get('minimumOrderValue', 0), promo.get('usageLimitPerCustomer', 1),
                    promo.get('isActive', True), promo.get('startDate'), promo.get('endDate'),
                ))
                results['added'].append(promo_code)
            except Exception as e:
                results['errors'].append(str(e))

        for promo_code in update_data.get('promotions_to_delete', []):
            try:
                cur.execute("DELETE FROM shop.promotions WHERE promo_code = %s", (promo_code,))
                results['deleted'].append(promo_code)
            except Exception as e:
                results['errors'].append(str(e))

        for edit in update_data.get('promotions_to_edit', []):
            try:
                promo_code = edit['promoCode']
                laundry_id = edit.get('laundryId')
                sets, vals = [], []
                field_map = {
                    'promotionName': 'promo_name', 'promotionDescription': 'description',
                    'startDate': 'start_date', 'endDate': 'end_date',
                    'discountType': 'discount_type', 'discountValue': 'discount_value',
                    'isActive': 'is_active', 'usageLimitPerCustomer': 'usage_limit_per_customer',
                }
                for k, col in field_map.items():
                    if k in edit:
                        sets.append(f"{col} = %s"); vals.append(edit[k])
                if sets:
                    sets.append("updated_at = NOW()")
                    vals += [laundry_id, promo_code]
                    cur.execute(f"UPDATE shop.promotions SET {', '.join(sets)} WHERE laundry_id = %s AND promo_code = %s", vals)
                results['edited'].append(promo_code)
            except Exception as e:
                results['errors'].append(str(e))

        db.commit()
        return {'statusCode': 200, 'body': json.dumps({'message': 'Promotions processed.', 'results': results})}
    except Exception as e:
        db.rollback()
        return {'statusCode': 500, 'body': json.dumps({'message': str(e), 'results': results})}


def lambda_handler(event, context):
    query_params = event.get('queryStringParameters', {}) or {}
    operation = query_params.get('operation')
    if not operation:
        return {'statusCode': 400, 'body': json.dumps({'message': 'Missing operation.'})}

    try:
        body = event.get('body', {})
        if isinstance(body, str):
            body = json.loads(body)

        if operation == 'viewPromotions':
            return view_all_promotions()
        elif operation == 'updatePromotions':
            return update_promotions(body)
        elif operation == 'validatePromo':
            promo_code = body.get('promoCode')
            laundry_id = body.get('laundryId')
            if not promo_code or not laundry_id:
                return {'statusCode': 400, 'body': json.dumps({'message': 'promoCode and laundryId required.'})}
            result = validate_promo_code(promo_code, laundry_id)
            return {'statusCode': 200 if result['isValid'] else 400, 'body': json.dumps(result)}
        elif operation == 'updatePromoUsage':
            customer_id = body.get('customerId')
            promo_code = body.get('promoCode')
            order_id = body.get('orderId')
            laundry_id = body.get('laundryId')
            if not all([customer_id, promo_code, order_id, laundry_id]):
                return {'statusCode': 400, 'body': json.dumps({'message': 'Missing required fields.'})}
            cur = db.get_cursor()
            cur.execute("SELECT * FROM shop.promotions WHERE promo_code = %s AND laundry_id = %s", (promo_code, laundry_id))
            promo = cur.fetchone()
            if not promo:
                return {'statusCode': 404, 'body': json.dumps({'message': 'Promotion not found.'})}
            result = update_promo_usage(customer_id, promo_code, order_id, laundry_id, dict(promo))
            return {'statusCode': result['statusCode'], 'body': json.dumps({'message': result['message']})}
        else:
            return {'statusCode': 400, 'body': json.dumps({'message': f'Invalid operation: {operation}'})}

    except json.JSONDecodeError:
        return {'statusCode': 400, 'body': json.dumps({'message': 'Invalid JSON.'})}
    except Exception as e:
        logger.exception("LaundryPromotionsService error")
        return {'statusCode': 500, 'body': json.dumps({'message': str(e)})}
