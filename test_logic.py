def test():
    row = {"name": "Mohamed", "phone": "01001234567"}
    name = str(row.get('business name') or row.get('name') or row.get('company') or row.get('title') or '').strip()
    phone = str(row.get('mobile') or row.get('phone') or row.get('telephone') or '').strip()
    print(f"name: {name}, phone: {phone}")
test()
