import urllib.request, urllib.error; req = urllib.request.Request('https://medcrm-zeta.vercel.app/api/manager-chat', method='POST'); 
try: urllib.request.urlopen(req)
except urllib.error.HTTPError as e: print(e.code, e.read().decode())
