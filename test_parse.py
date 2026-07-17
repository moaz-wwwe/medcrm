import csv, io

headers = ['Governorate', 'Website', 'Rating', 'Date Scraped', 'Mobile', 'Instagram', 'LinkedIn', 'Longitude', 'Category', 'City', 'Email', 'Latitude', 'Source', 'Google Maps', 'Facebook', 'Address', 'Phone', 'Reviews', '\ufeffBusiness Name']
row = {h: f'value_for_{h}' for h in headers}

normalized_rows = []
norm_row = {}
for k, v in row.items():
    if k is None: continue
    clean_k = str(k).replace('\ufeff', '').strip().lower()
    norm_row[clean_k] = v
normalized_rows.append(norm_row)

for i, row in enumerate(normalized_rows):
    name = ''
    phone = ''
    facility_type = ''
    notes_parts = []
    
    for k, v in row.items():
        v_str = str(v).strip()
        if not v_str: continue
        
        if 'name' in k or 'اسم' in k:
            name = v_str
        elif 'phone' in k or 'mobile' in k or 'رقم' in k or 'موبايل' in k:
            phone = v_str
        elif 'category' in k or 'type' in k or 'نوع' in k or 'تصنيف' in k:
            facility_type = v_str
        else:
            notes_parts.append(f'{k}: {v_str}')

    print(f'Name: {name}, Phone: {phone}, Type: {facility_type}')
