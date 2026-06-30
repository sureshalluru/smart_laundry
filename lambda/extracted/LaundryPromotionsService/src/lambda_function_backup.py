import json
import boto3
import uuid
from datetime import datetime
from decimal import Decimal

# Initialize DynamoDB resource
dynamodb = boto3.resource('dynamodb')
promotions_table = dynamodb.Table('Promotions')
laundry_promotions_table = dynamodb.Table('LaundryPromotions')
customer_promo_usage_table = dynamodb.Table('CustomerPromoUsage')
orders_table = dynamodb.Table('LaundryOrders')

def decimal_serializer(obj):
    """
    Custom serializer to convert Decimal objects to float or int.
    """
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Type {type(obj)} not serializable")

def generate_promo_code(promotion_name):
    """
    Generates a unique 4-char promo code using UUID and promotion name.
    """
    uuid_part = str(uuid.uuid4())[:2].upper()
    name_part = ''.join(filter(str.isalnum, promotion_name)).upper()[:2]
    return f"{name_part}{uuid_part}"


# def update_promotions(update_data):
#     """
#     Handles add, delete, or edit operations for promotions efficiently.

#     Args:
#         update_data (dict): The update details, which may include add, delete, or edit operations.

#     Returns:
#         dict: Response indicating success or error.
#     """
#     results = {
#         'added': [],
#         'deleted': [],
#         'edited': [],
#         'errors': []
#     }

#     # Collect items for batch operations
#     promotions_to_add = []
#     promotions_to_delete = []
#     promotions_to_update = []
#     laundry_promotions_to_add = []
#     laundry_promotions_to_delete = []

#     # Process add operations
#     for promo in update_data.get('promotions_to_add', []):
#         try:
#             promotion_name = promo['promotionName']
#             promotion_description = promo.get('promotionDescription', 'No description provided.')
#             start_date = promo['startDate']
#             end_date = promo['endDate']
#             discount_type = promo['discountType']
#             discount_value = Decimal(str(promo['discountValue']))
#             usage_limit_per_customer = promo.get('usageLimitPerCustomer', 1)
#             is_active = promo.get('isActive', True)
#             terms_and_conditions = promo.get('termsAndConditions', '')
#             laundries = promo['laundries']
#             services_applicable = promo.get('servicesApplicable', [])

#             # Validate servicesApplicable
#             validated_services = []
#             for service in services_applicable:
#                 if not isinstance(service, dict) or 'serviceName' not in service or 'weightOrCount' not in service:
#                     results['errors'].append(
#                         f"Invalid service entry in servicesApplicable for promotion '{promotion_name}'. "
#                         "Each service must have 'serviceName' and 'weightOrCount'."
#                     )
#                     continue
#                 validated_services.append({
#                     'serviceName': service['serviceName'],
#                     'weightOrCount': Decimal(str(service['weightOrCount']))
#                 })

#             promo_code = generate_promo_code(promotion_name)

#             promotion_item = {
#                 'promoCode': promo_code,
#                 'promotionName': promotion_name,
#                 'promotionDescription': promotion_description,
#                 'startDate': start_date,
#                 'endDate': end_date,
#                 'discountType': discount_type,
#                 'discountValue': discount_value,
#                 'usageLimitPerCustomer': usage_limit_per_customer,
#                 'isActive': is_active,
#                 'termsAndConditions': terms_and_conditions,
#                 'servicesApplicable': validated_services,
#                 'laundries': laundries,
#                 'createdAt': datetime.utcnow().isoformat()
#             }

#             promotions_to_add.append(promotion_item)
#             results['added'].append(promo_code)


#             # Prepare laundry promotions
#             # for laundry_id in laundries:
#             #     laundry_promotions_to_add.append({
#             #         'PutRequest': {
#             #             'Item': {
#             #                 'laundryId': laundry_id,
#             #                 'promoCode': promo_code,
#             #                 'promotionDetails': promotion_item
#             #             }
#             #         }
#             #     })
#             # Prepare laundry promotions
#             for laundry_id in laundries:
#                 laundry_promotions_to_add.append({
#                     'PutRequest': {
#                         'Item': {
#                             'laundryId': {'S': str(laundry_id)},
#                             'promoCode': {'S': promo_code},
#                             'promotionDetails': {
#                                 'M': {
#                                     'promoCode': {'S': promo_code},
#                                     'promotionName': {'S': promotion_name},
#                                     'promotionDescription': {'S': promotion_description},
#                                     'startDate': {'S': start_date},
#                                     'endDate': {'S': end_date},
#                                     'discountType': {'S': discount_type},
#                                     'discountValue': {'N': str(discount_value)},
#                                     'usageLimitPerCustomer': {'N': str(usage_limit_per_customer)},
#                                     'isActive': {'BOOL': is_active},
#                                     'termsAndConditions': {'S': terms_and_conditions},
#                                     'servicesApplicable': {
#                                         'L': [
#                                             {
#                                                 'M': {
#                                                     'serviceName': {'S': service['serviceName']},
#                                                     'weightOrCount': {'N': str(service['weightOrCount'])}
#                                                 }
#                                             } for service in validated_services
#                                         ]
#                                     },
#                                     'laundries': {'L': [{'S': str(laundry)} for laundry in laundries]},
#                                     'createdAt': {'S': datetime.utcnow().isoformat()}
#                                 }
#                             }
#                         }
#                     }
#                 })

#         except KeyError as e:
#             results['errors'].append(f"Missing required field {e} in promotion to add.")
#         except Exception as e:
#             results['errors'].append(f"Error adding promotion '{promo.get('promotionName')}': {str(e)}")

#     # Process delete operations
#     for promo_code in update_data.get('promotions_to_delete', []):
#         try:
#             promotion = promotions_table.get_item(Key={'promoCode': promo_code}).get('Item')
#             if not promotion:
#                 results['errors'].append(f"Promotion '{promo_code}' not found for deletion.")
#                 continue

#             promotions_to_delete.append({'promoCode': promo_code})

#             for laundry_id in promotion.get('laundries', []):
#                 laundry_promotions_to_delete.append({
#                     'DeleteRequest': {
#                         'Key': {
#                             'laundryId': {'S': laundry_id},
#                             'promoCode': {'S': promo_code}
#                         }
#                     }
#                 })

#             results['deleted'].append(promo_code)

#         except Exception as e:
#             results['errors'].append(f"Error deleting promotion '{promo_code}': {str(e)}")

#     # Process edit operations
#     for edit in update_data.get('promotions_to_edit', []):
#         try:
#             promo_code = edit['promoCode']
#             update_fields = {}
#             expression_values = {}
#             update_expression_parts = []

#             for field in ['promotionName', 'promotionDescription', 'startDate', 'endDate',
#                           'discountType', 'discountValue', 'usageLimitPerCustomer', 'isActive',
#                           'termsAndConditions', 'servicesApplicable', 'laundries']:
#                 if field in edit:
#                     value = edit[field]
#                     if field == 'discountValue':
#                         value = Decimal(str(value))
#                     if field == 'servicesApplicable':
#                         validated_services = []
#                         for service in value:
#                             validated_services.append({
#                                 'serviceName': service['serviceName'],
#                                 'weightOrCount': Decimal(str(service['weightOrCount']))
#                             })
#                         value = validated_services

#                     update_fields[field] = value
#                     expression_values[f":{field}"] = value
#                     update_expression_parts.append(f"{field} = :{field}")

#             promotions_to_update.append({
#                 'promoCode': promo_code,
#                 'UpdateExpression': "SET " + ", ".join(update_expression_parts),
#                 'ExpressionAttributeValues': expression_values
#             })
#             results['edited'].append(promo_code)

#         except KeyError as e:
#             results['errors'].append(f"Missing required field {e} in promotion to edit.")
#         except Exception as e:
#             results['errors'].append(f"Error editing promotion '{promo_code}': {str(e)}")

#     # Execute batch operations
#     try:
#         # Batch write to Promotions table
#         with promotions_table.batch_writer() as batch:
#             for item in promotions_to_add:
#                 batch.put_item(Item=item)
#             for key in promotions_to_delete:
#                 batch.delete_item(Key=key)

#         # Batch write to LaundryPromotions table
#         if laundry_promotions_to_add:
#             batch_write_dynamodb(laundry_promotions_table.name, laundry_promotions_to_add)
#         if laundry_promotions_to_delete:
#             batch_write_dynamodb(laundry_promotions_table.name, laundry_promotions_to_delete)

#         # Process updates
#         for update in promotions_to_update:
#             promotions_table.update_item(
#                 Key={'promoCode': update['promoCode']},
#                 UpdateExpression=update['UpdateExpression'],
#                 ExpressionAttributeValues=update['ExpressionAttributeValues'],
#                 ConditionExpression="attribute_exists(promoCode)"
#             )

#     except Exception as e:
#         results['errors'].append(f"Error processing promotions: {str(e)}")
#         return {
#             'statusCode': 500,
#             'body': json.dumps({'message': f'Error processing promotions: {str(e)}', 'results': results})
#         }

#     return {
#         'statusCode': 200,
#         'body': json.dumps({
#             'message': 'Promotions processed successfully.',
#             'results': results
#         }, default=decimal_serializer)
#     }

def update_promotions(update_data):
    """
    Handles add, delete, or edit operations for promotions efficiently.

    Args:
        update_data (dict): The update details, which may include add, delete, or edit operations.

    Returns:
        dict: Response indicating success or error.
    """
    results = {
        'added': [],
        'deleted': [],
        'edited': [],
        'errors': []
    }

    # Collect items for batch operations
    promotions_to_add = []
    promotions_to_delete = []
    promotions_to_update = []
    laundry_promotions_to_add = []
    laundry_promotions_to_delete = []

    # Process add operations
    for promo in update_data.get('promotions_to_add', []):
        try:
            promotion_name = promo['promotionName']
            promotion_description = promo.get('promotionDescription', 'No description provided.')
            start_date = promo['startDate']
            end_date = promo['endDate']
            discount_type = promo['discountType']
            discount_value = Decimal(str(promo['discountValue']))
            usage_limit_per_customer = promo.get('usageLimitPerCustomer', 1)
            is_active = promo.get('isActive', True)
            terms_and_conditions = promo.get('termsAndConditions', '')
            laundries = promo['laundries']
            services_applicable = promo.get('servicesApplicable', [])

            # Validate servicesApplicable
            validated_services = []
            for service in services_applicable:
                if not isinstance(service, dict) or 'serviceName' not in service or 'weightOrCount' not in service:
                    results['errors'].append(
                        f"Invalid service entry in servicesApplicable for promotion '{promotion_name}'. "
                        "Each service must have 'serviceName' and 'weightOrCount'."
                    )
                    continue
                validated_services.append({
                    'serviceName': service['serviceName'],
                    'weightOrCount': Decimal(str(service['weightOrCount']))
                })

            promo_code = generate_promo_code(promotion_name)

            promotion_item = {
                'promoCode': promo_code,
                'promotionName': promotion_name,
                'promotionDescription': promotion_description,
                'startDate': start_date,
                'endDate': end_date,
                'discountType': discount_type,
                'discountValue': discount_value,
                'usageLimitPerCustomer': usage_limit_per_customer,
                'isActive': is_active,
                'termsAndConditions': terms_and_conditions,
                'servicesApplicable': validated_services,
                'laundries': laundries,
                'createdAt': datetime.utcnow().isoformat()
            }

            promotions_to_add.append(promotion_item)
            results['added'].append(promo_code)

            # Prepare laundry promotions
            for laundry_id in laundries:
                laundry_promotions_to_add.append({
                    'PutRequest': {
                        'Item': {
                            'laundryId': {'S': str(laundry_id)},
                            'promoCode': {'S': promo_code},
                            'promotionDetails': {
                                'M': {
                                    'promoCode': {'S': promo_code},
                                    'promotionName': {'S': promotion_name},
                                    'promotionDescription': {'S': promotion_description},
                                    'startDate': {'S': start_date},
                                    'endDate': {'S': end_date},
                                    'discountType': {'S': discount_type},
                                    'discountValue': {'N': str(discount_value)},
                                    'usageLimitPerCustomer': {'N': str(usage_limit_per_customer)},
                                    'isActive': {'BOOL': is_active},
                                    'termsAndConditions': {'S': terms_and_conditions},
                                    'servicesApplicable': {
                                        'L': [
                                            {
                                                'M': {
                                                    'serviceName': {'S': service['serviceName']},
                                                    'weightOrCount': {'N': str(service['weightOrCount'])}
                                                }
                                            } for service in validated_services
                                        ]
                                    },
                                    'laundries': {'L': [{'S': str(laundry)} for laundry in laundries]},
                                    'createdAt': {'S': datetime.utcnow().isoformat()}
                                }
                            }
                        }
                    }
                })

        except KeyError as e:
            results['errors'].append(f"Missing required field {e} in promotion to add.")
        except Exception as e:
            results['errors'].append(f"Error adding promotion '{promo.get('promotionName')}': {str(e)}")

    # Process delete operations
    for promo_code in update_data.get('promotions_to_delete', []):
        try:
            promotion = promotions_table.get_item(Key={'promoCode': promo_code}).get('Item')
            if not promotion:
                results['errors'].append(f"Promotion '{promo_code}' not found for deletion.")
                continue

            promotions_to_delete.append({'promoCode': promo_code})

            for laundry_id in promotion.get('laundries', []):
                laundry_promotions_to_delete.append({
                    'DeleteRequest': {
                        'Key': {
                            'laundryId': {'S': str(laundry_id)},
                            'promoCode': {'S': promo_code}
                        }
                    }
                })

            results['deleted'].append(promo_code)

        except Exception as e:
            results['errors'].append(f"Error deleting promotion '{promo_code}': {str(e)}")

    # Process edit operations
    for edit in update_data.get('promotions_to_edit', []):
        try:
            promo_code = edit['promoCode']
            # Validate the existence of promoCode before updating
            existing_promo = promotions_table.get_item(Key={'promoCode': promo_code}).get('Item')
            if not existing_promo:
                results['errors'].append(f"Promotion '{promo_code}' not found for editing.")
                continue

            update_fields = {}
            expression_values = {}
            update_expression_parts = []

            for field in ['promotionName', 'promotionDescription', 'startDate', 'endDate',
                          'discountType', 'discountValue', 'usageLimitPerCustomer', 'isActive',
                          'termsAndConditions', 'servicesApplicable', 'laundries']:
                if field in edit:
                    value = edit[field]
                    if field == 'discountValue':
                        value = Decimal(str(value))
                    if field == 'servicesApplicable':
                        validated_services = []
                        for service in value:
                            validated_services.append({
                                'serviceName': service['serviceName'],
                                'weightOrCount': Decimal(str(service['weightOrCount']))
                            })
                        value = validated_services

                    update_fields[field] = value
                    expression_values[f":{field}"] = value
                    update_expression_parts.append(f"{field} = :{field}")

            promotions_to_update.append({
                'promoCode': promo_code,
                'UpdateExpression': "SET " + ", ".join(update_expression_parts),
                'ExpressionAttributeValues': expression_values
            })
            results['edited'].append(promo_code)

        except KeyError as e:
            results['errors'].append(f"Missing required field {e} in promotion to edit.")
        except Exception as e:
            results['errors'].append(f"Error editing promotion '{promo_code}': {str(e)}")

    # Execute batch operations
    try:
        # Batch write to Promotions table
        with promotions_table.batch_writer() as batch:
            for item in promotions_to_add:
                batch.put_item(Item=item)
            for key in promotions_to_delete:
                batch.delete_item(Key=key)

        # Batch write to LaundryPromotions table
        if laundry_promotions_to_add:
            batch_write_dynamodb(laundry_promotions_table.name, laundry_promotions_to_add)
        if laundry_promotions_to_delete:
            batch_write_dynamodb(laundry_promotions_table.name, laundry_promotions_to_delete)

        # Process updates
        for update in promotions_to_update:
            try:
                promotions_table.update_item(
                    Key={'promoCode': update['promoCode']},
                    UpdateExpression=update['UpdateExpression'],
                    ExpressionAttributeValues=update['ExpressionAttributeValues'],
                    ConditionExpression="attribute_exists(promoCode)"
                )
            except dynamodb.meta.client.exceptions.ConditionalCheckFailedException:
                results['errors'].append(f"Conditional update failed for promoCode '{update['promoCode']}'. It may not exist in the table.")

    except Exception as e:
        results['errors'].append(f"Error processing promotions: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({'message': f'Error processing promotions: {str(e)}', 'results': results})
        }

    return {
        'statusCode': 200,
        'body': json.dumps({
            'message': 'Promotions processed successfully.',
            'results': results
        }, default=decimal_serializer)
    }


def view_all_promotions():
    """
    Retrieves all promotions from the Promotions table.
    Handles pagination if the table contains many items.

    Returns:
        dict: Response containing all promotions or an error message.
    """
    try:
        promotions = []
        response = promotions_table.scan()

        # Collect promotions from the first scan
        promotions.extend(response.get('Items', []))

        # Handle pagination using LastEvaluatedKey
        while 'LastEvaluatedKey' in response:
            response = promotions_table.scan(ExclusiveStartKey=response['LastEvaluatedKey'])
            promotions.extend(response.get('Items', []))

        # Convert Decimal fields to float for JSON serialization
        promotions = json.loads(json.dumps(promotions, default=decimal_serializer))

        return {
            'statusCode': 200,
            'body': {'promotions': promotions}
        }

    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({'message': f'Error retrieving promotions: {str(e)}'})
        }
        
def validate_promo_code(promo_code, laundry_id):
    """
    Validates the promo code for eligibility.
    """
    try:
        promotion = promotions_table.get_item(Key={'promoCode': promo_code}).get('Item')
        if not promotion:
            return {'isValid': False, 'message': 'Promotion not found.'}
        
        # Check if promo is active
        if not promotion.get('isActive', True):
            return {'isValid': False, 'message': 'Promotion is not active.'}
        
        # Check validity period
        current_date = datetime.utcnow().isoformat()
        if current_date < promotion['startDate'] or current_date > promotion['endDate']:
            return {'isValid': False, 'message': 'Promotion is not currently valid.'}
        
        # Check if promo is applicable to the given laundry
        if laundry_id not in promotion.get('laundries', []):
            return {'isValid': False, 'message': 'Promotion not applicable for this laundry.'}
        
        return {'isValid': True, 'promotion': promotion}
    except Exception as e:
        return {'isValid': False, 'message': f'Error validating promo code: {str(e)}'}


def apply_promo_to_order(order_id, promo_code):
    """
    Checks if the promo code is already applied and ensures order status is eligible.
    """
    try:
        # Check order status
        order = orders_table.get_item(Key={'orderId': order_id}).get('Item')
        if not order:
            return {'success': False, 'message': 'Order not found.'}
        
        if order.get('orderStatus') != 'OrderSubmitted':
            return {'success': False, 'message': 'Promo can only be applied to orders with status OrderSubmitted.'}
        
        # Check if promo is already applied
        customer_usage = customer_promo_usage_table.get_item(
            Key={'customerId': order['customerId'], 'promoCode': promo_code}
        ).get('Item')
        
        if customer_usage:
            for usage in customer_usage.get('usageHistory', []):
                if usage['orderId'] == order_id:
                    return {'success': False, 'message': 'Promo already applied in this order.'}
        
        return {'success': True, 'message': 'Promo can be applied to this order.', 'order': order}
    except Exception as e:
        return {'success': False, 'message': f'Error applying promo to order: {str(e)}'}


def update_promo_usage(customer_id, promo_code, order_id, laundry_id, promotion):
    """
    Updates the promo code usage after verifying eligibility.
    """
    try:
        current_time = datetime.utcnow().isoformat()
        usage_entry = {
            'orderId': order_id,
            'usedAt': current_time,
            'laundryId': laundry_id
        }

        # Update promo usage atomically
        customer_promo_usage_table.update_item(
            Key={'customerId': customer_id, 'promoCode': promo_code},
            UpdateExpression="""
                SET usageCount = if_not_exists(usageCount, :start) + :increment,
                    lastUsedAt = :lastUsedAt,
                    usageHistory = list_append(if_not_exists(usageHistory, :empty_list), :new_entry)
            """,
            ExpressionAttributeValues={
                ':increment': 1,
                ':start': 0,
                ':lastUsedAt': current_time,
                ':new_entry': [usage_entry],
                ':empty_list': [],
                ':usageLimit': Decimal(str(promotion.get('usageLimitPerCustomer', 1)))  # Consolidated Expression Values
            },
            ConditionExpression="attribute_not_exists(usageCount) OR usageCount < :usageLimit"
        )
        return {'statusCode': 200, 'message': 'Promo usage updated successfully.'}
    except dynamodb.meta.client.exceptions.ConditionalCheckFailedException:
        return {'statusCode': 400, 'message': 'Usage limit exceeded for this promo code.'}
    except Exception as e:
        return {'statusCode': 500, 'message': f'Error updating promo usage: {str(e)}'}
        
def batch_write_dynamodb(table_name, items):
    """
    Performs batch write operations (put or delete) for a given DynamoDB table.

    Args:
        table_name (str): The name of the DynamoDB table.
        items (list): A list of dictionaries representing items to put or delete.

    Returns:
        None
    """
    dynamodb_client = boto3.client('dynamodb')
    MAX_BATCH_SIZE = 25  # DynamoDB allows a maximum of 25 items per batch write

    for i in range(0, len(items), MAX_BATCH_SIZE):
        batch = items[i:i + MAX_BATCH_SIZE]
        try:
            response = dynamodb_client.batch_write_item(RequestItems={table_name: batch})
            unprocessed_items = response.get('UnprocessedItems', {})

            # Retry logic for unprocessed items
            while unprocessed_items:
                response = dynamodb_client.batch_write_item(RequestItems=unprocessed_items)
                unprocessed_items = response.get('UnprocessedItems', {})
        except Exception as e:
            print(f"Error in batch_write_dynamodb for table {table_name}: {str(e)}")
            raise

def lambda_handler(event, context):
    """
    Main Lambda function handler.
    """
    query_params = event.get('queryStringParameters', {}) or {}
    operation = query_params.get('operation')  # Extract operation from query parameters

    if not operation:
        return {
            'statusCode': 400,
            'body': json.dumps({'message': 'Missing required query parameter: operation.'})
        }

    try:
        # Parse the body (JSON payload) if provided
        body_data = event.get('body')
        if body_data:
            if isinstance(body_data, str):
                body_data = json.loads(body_data)
        else:
            body_data = {}

        # Route operations
        if operation == 'viewPromotions':
            return view_all_promotions()
        
        elif operation == 'viewActivePromotions':
            return view_active_promotions()

        elif operation == 'updatePromotions':
            return update_promotions(body_data)

        elif operation == 'validatePromo':
            # Validate promo code
            promo_code = body_data.get('promoCode')
            laundry_id = body_data.get('laundryId')
            if not promo_code or not laundry_id:
                return {
                    'statusCode': 400,
                    'body': json.dumps({'message': 'promoCode and laundryId are required for validation.'})
                }
            validation_result = validate_promo_code(promo_code, laundry_id)
            return {
                'statusCode': 200 if validation_result['isValid'] else 400,
                'body': json.dumps(validation_result)
            }

        elif operation == 'applyPromoToOrder':
            # Apply promo code to an order
            customer_id = body_data.get('customerId')
            promo_code = body_data.get('promoCode')
            order_id = body_data.get('orderId')
            if not customer_id or not promo_code or not order_id:
                return {
                    'statusCode': 400,
                    'body': json.dumps({'message': 'customerId, promoCode, and orderId are required to apply promo.'})
                }
            apply_result = apply_promo_to_order(order_id, promo_code)
            return {
                'statusCode': 200 if apply_result['success'] else 400,
                'body': json.dumps(apply_result)
            }

        elif operation == 'updatePromoUsage':
            # Update promo usage after order is validated
            customer_id = body_data.get('customerId')
            promo_code = body_data.get('promoCode')
            order_id = body_data.get('orderId')
            laundry_id = body_data.get('laundryId')

            if not customer_id or not promo_code or not order_id or not laundry_id:
                return {
                    'statusCode': 400,
                    'body': json.dumps({'message': 'customerId, promoCode, laundryId, and orderId are required for usage update.'})
                }

            # Fetch promotion details for usage update
            promo = promotions_table.get_item(Key={'promoCode': promo_code}).get('Item')
            if not promo:
                return {
                    'statusCode': 404,
                    'body': json.dumps({'message': 'Promotion not found.'})
                }

            update_result = update_promo_usage(customer_id, promo_code, order_id, laundry_id, promo)
            return {
                'statusCode': update_result['statusCode'],
                'body': json.dumps({'message': update_result['message']})
            }

        else:
            return {
                'statusCode': 400,
                'body': json.dumps({'message': f'Invalid operation: {operation}'})
            }

    except json.JSONDecodeError:
        return {
            'statusCode': 400,
            'body': json.dumps({'message': 'Invalid JSON format in request body.'})
        }
    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({'message': f'Unexpected error: {str(e)}'})
        }
