#!/usr/bin/env python3
"""
Script to automatically replace Arabic toast messages with translation keys
"""
import re
import json
import os
from pathlib import Path

# Load toast mapping
with open('/home/ubuntu/sari/toast-mapping.json', 'r', encoding='utf-8') as f:
    toast_mapping = json.load(f)

# Flatten mapping
flat_mapping = {}
for category, messages in toast_mapping.items():
    flat_mapping.update(messages)

# Pages directory
pages_dir = Path("/home/ubuntu/sari/client/src/pages")

# Statistics
stats = {
    'files_processed': 0,
    'files_modified': 0,
    'replacements': 0,
    'errors': []
}

def replace_toast_in_file(file_path):
    """Replace toast messages in a single file"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        original_content = content
        replacements_in_file = 0
        
        # Pattern 1: toast.success('message')
        # Pattern 2: toast.error('message')
        # Pattern 3: toast.info('message')
        # Pattern 4: toast.warning('message')
        
        for ar_msg, key in flat_mapping.items():
            # Escape special regex characters in the Arabic message
            escaped_msg = re.escape(ar_msg)
            
            # Pattern for simple messages: toast.xxx('message')
            pattern1 = rf"(toast\.(success|error|info|warning)\s*\(\s*['\"]){escaped_msg}(['\"])"
            replacement1 = rf"\1{{t('{key}')}}\3"
            
            if re.search(pattern1, content):
                content = re.sub(pattern1, replacement1, content)
                replacements_in_file += 1
            
            # Pattern for messages with concatenation: toast.xxx('message: ' + error.message)
            pattern2 = rf"(toast\.(success|error|info|warning)\s*\(\s*['\"]){escaped_msg}:\s*['\"](\s*\+)"
            replacement2 = rf"\1{{t('{key}')}}: '\3"
            
            if re.search(pattern2, content):
                content = re.sub(pattern2, replacement2, content)
                replacements_in_file += 1
            
            # Pattern for messages with template literals
            pattern3 = rf"(toast\.(success|error|info|warning)\s*\(\s*`){escaped_msg}"
            replacement3 = rf"\1{{t('{key}')}}"
            
            if re.search(pattern3, content):
                content = re.sub(pattern3, replacement3, content)
                replacements_in_file += 1
        
        # Special case: "تم استيراد ${count} منتج بنجاح"
        special_pattern = r"toast\.success\(`تم استيراد \$\{[^}]+\} منتج بنجاح`\)"
        if re.search(special_pattern, content):
            content = re.sub(
                special_pattern,
                r"toast.success(`${t('toast.upload.msg1')} ${data.imported} ${t('toast.products.msg8')}`)",
                content
            )
            replacements_in_file += 1
        
        # Special case for dynamic status messages
        # "الاتصال ناجح! الحالة: ${data.status}"
        dynamic_pattern1 = r"toast\.success\(`الاتصال ناجح! الحالة: \$\{[^}]+\}`\)"
        if re.search(dynamic_pattern1, content):
            content = re.sub(
                dynamic_pattern1,
                r"toast.success(`${t('toast.instances.msg9')}: ${data.status}`)",
                content
            )
            replacements_in_file += 1
        
        # "فشل الاتصال: ${data.message}"
        dynamic_pattern2 = r"toast\.error\(`فشل الاتصال: \$\{[^}]+\}`\)"
        if re.search(dynamic_pattern2, content):
            content = re.sub(
                dynamic_pattern2,
                r"toast.error(`${t('toast.instances.msg10')}: ${data.message}`)",
                content
            )
            replacements_in_file += 1
        
        if content != original_content:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            
            stats['files_modified'] += 1
            stats['replacements'] += replacements_in_file
            return True, replacements_in_file
        
        return False, 0
    
    except Exception as e:
        stats['errors'].append(f"{file_path}: {str(e)}")
        return False, 0

def process_directory(directory):
    """Process all TypeScript files in directory"""
    for file_path in directory.rglob("*.tsx"):
        # Skip Products.tsx as it's already done
        if file_path.name == "Products.tsx" and "merchant" in str(file_path):
            print(f"⊘ Skipping {file_path.name} (already processed)")
            continue
        
        stats['files_processed'] += 1
        modified, count = replace_toast_in_file(file_path)
        
        if modified:
            print(f"✓ {file_path.relative_to(pages_dir)}: {count} replacements")
        else:
            # Check if file has toast messages
            with open(file_path, 'r', encoding='utf-8') as f:
                if 'toast.' in f.read():
                    print(f"○ {file_path.relative_to(pages_dir)}: no matches (may need manual review)")

def main():
    print("=" * 70)
    print("Replacing Toast Messages with Translation Keys")
    print("=" * 70)
    print()
    
    # Add missing translations to mapping
    additional_translations = {
        'منتج بنجاح': 'toast.products.msg8',  # for "تم استيراد X منتج بنجاح"
        'الاتصال ناجح! الحالة': 'toast.instances.msg9',
        'فشل الاتصال': 'toast.instances.msg10',
    }
    flat_mapping.update(additional_translations)
    
    # Process all files
    process_directory(pages_dir)
    
    print()
    print("=" * 70)
    print("Summary")
    print("=" * 70)
    print(f"Files processed: {stats['files_processed']}")
    print(f"Files modified: {stats['files_modified']}")
    print(f"Total replacements: {stats['replacements']}")
    
    if stats['errors']:
        print(f"\nErrors: {len(stats['errors'])}")
        for error in stats['errors']:
            print(f"  - {error}")
    
    print("=" * 70)
    print("Done! Please review the changes and test the application.")
    print("=" * 70)

if __name__ == "__main__":
    main()
