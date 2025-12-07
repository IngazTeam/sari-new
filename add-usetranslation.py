#!/usr/bin/env python3
import os
import re

files = [
    "client/src/pages/ChatOrders.tsx",
    "client/src/pages/SallaIntegration.tsx",
    "client/src/pages/Support.tsx",
    "client/src/pages/admin/Merchants.tsx",
    "client/src/pages/admin/PaymentGateways.tsx",
    "client/src/pages/admin/Settings.tsx",
    "client/src/pages/admin/WhatsAppRequests.tsx",
    "client/src/pages/admin/WhatsAppRequestsPage.tsx",
    "client/src/pages/merchant/AbandonedCartsPage.tsx",
    "client/src/pages/merchant/Analytics.tsx",
    "client/src/pages/merchant/CampaignDetails.tsx",
    "client/src/pages/merchant/Checkout.tsx",
    "client/src/pages/merchant/NewCampaign.tsx",
    "client/src/pages/merchant/OccasionCampaignsPage.tsx",
    "client/src/pages/merchant/OrderNotificationsSettings.tsx",
    "client/src/pages/merchant/Settings.tsx",
    "client/src/pages/merchant/Subscriptions.tsx",
    "client/src/pages/merchant/UploadProducts.tsx",
    "client/src/pages/merchant/WhatsApp.tsx",
    "client/src/pages/merchant/WhatsAppSetupWizard.tsx",
]

for filepath in files:
    fullpath = f"/home/ubuntu/sari/{filepath}"
    if not os.path.exists(fullpath):
        print(f"✗ {filepath} not found")
        continue
    
    with open(fullpath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Check if already has useTranslation
    if 'useTranslation' in content:
        print(f"✓ {filepath} already has useTranslation")
        continue
    
    # Add import
    if "import { useTranslation } from 'react-i18next';" not in content:
        # Find last import line
        import_pattern = r'(import .*?;)\n(?!import)'
        match = list(re.finditer(import_pattern, content, re.MULTILINE))
        if match:
            last_import_end = match[-1].end()
            content = content[:last_import_end] + "\nimport { useTranslation } from 'react-i18next';" + content[last_import_end:]
    
    # Add const { t } = useTranslation(); after function declaration
    function_pattern = r'(export default function \w+\([^)]*\)\s*\{)'
    match = re.search(function_pattern, content)
    if match:
        func_end = match.end()
        # Check if already has const { t }
        if 'const { t } = useTranslation();' not in content[func_end:func_end+200]:
            content = content[:func_end] + "\n  const { t } = useTranslation();\n" + content[func_end:]
    
    with open(fullpath, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f"✓ {filepath} updated")

print("Done!")
