import re,sys
s=open(sys.argv[1]).read()
seen=[]
for m in re.finditer(r'<XCUIElementType(\w+)\b[^>]*>',s):
    t=m.group(0); typ=m.group(1)
    if typ in ('Key','Keyboard','Window','Application','Other','Image','ScrollView','WebView'): continue
    l=re.search(r' label="([^"]*)"',t); v=re.search(r' value="([^"]*)"',t); vis=re.search(r' visible="([^"]*)"',t); y=re.search(r' y="(-?\d+)"',t)
    lab=(l and l.group(1)) or ''
    if not lab or (vis and vis.group(1)!='true'): continue
    item=f"{typ[:6]}:{lab[:50]}" + (f"={v.group(1)[:30]}" if v and v.group(1) and v.group(1)!=lab else '') + f"@{y.group(1) if y else '?'}"
    if item not in seen: seen.append(item)
print(' | '.join(seen))
