# Zid Create Draft Order API

## Endpoint
`POST https://api.zid.sa/v1/managers/store/drafts`

## Required Scopes
- `Order.create` - Permission to create new orders
- `orders.read_write` - Full read & write access to orders

## Required Headers
```
Authorization: Bearer [access_token]
Accept: application/json
Accept-Language: ar
X-MANAGER-TOKEN: [manager_token]
Content-Type: application/json
```

## Request Body Structure
```json
{
    "currency_code": "SAR",
    "created_by": "partner",
    "customer": {
        "full_name": "اسم العميل",
        "mobile_country_code": "966",
        "mobile_number": "5XXXXXXXX",
        "email": "customer@email.com"
    },
    "consignee": {
        "contact": {
            "full_name": "اسم المستلم",
            "mobile_country_code": "966",
            "mobile_number": "5XXXXXXXX",
            "email": "consignee@email.com"
        },
        "address": {
            "line_1": "العنوان الرئيسي",
            "line_2": "تفاصيل إضافية",
            "city_name": "Riyadh",
            "country_code": "SA"
        }
    },
    "is_gift": false,
    "is_gifted_consignee_notifiable": false,
    "products": [
        {
            "sku": "Z.XXXXXX.XXXXXXXXXX",
            "quantity": 1,
            "custom_fields": []
        }
    ],
    "shipping_method": {
        "type": "delivery",
        "id": 601943
    },
    "payment_method": {
        "id": 854148
    }
}
```

## Payment Link Configuration
If payment method is `payment_link`, add:
```json
"payment_link_configs": {
   "expiryDateTime": "2024-12-10T13:00:49.947Z"
}
```

## Response (Success - 200)
```json
{
    "status": "object",
    "order": {
        "id": 44374824,
        "code": "owYRx38BFx",
        "store_id": 617072,
        "order_url": "https://store.zid.store/o/owYRx38BFx/inv",
        "store_name": "Store Name",
        "order_status": {...},
        "currency_code": "SAR",
        "customer": {...},
        "order_total": "34.00000000000000",
        "order_total_string": "34.00 SAR"
    }
}
```

## Integration Notes for Sari
1. Need to get payment methods list first: `GET /v1/managers/store/payment-methods`
2. Need to get shipping methods list: `GET /v1/managers/store/shipping-methods`
3. Products must use SKU from Zid (not internal product ID)
4. Customer phone should be without country code in `mobile_number`
