import io, csv

def test():
    decoded_content = "Mohammed,01001234567\nAhmed,01007654321\n"
    reader = csv.DictReader(io.StringIO(decoded_content))
    for row in list(reader):
        phone=''
        name=''
        print("ROW:", row)
        for v in row.values():
            v_str = str(v).strip()
            if not v_str: continue
            if not phone:
                digits = ''.join(c for c in v_str if c.isdigit())
                if 9 <= len(digits) <= 15:
                    phone = v_str
                    continue
            if not name and len(v_str) < 60 and not any(char.isdigit() for char in v_str):
                name = v_str
                continue
        print(f"name: {name}, phone: {phone}")

test()
