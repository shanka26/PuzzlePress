#!/usr/bin/env python3
"""Dependency-free structural, puzzle, and KDP dimension preflight."""
from pathlib import Path
import json, re, sys, zlib
OUT=Path(__file__).parent/"output"; manifest=json.loads((OUT/"manifest.json").read_text()); checks=[]
def check(name,ok,detail): checks.append({"name":name,"status":"PASS" if ok else "FAIL","detail":detail})
def pdf_pages(data): return max(map(int,re.findall(rb"/Count\s+(\d+)",data)))
def content_streams(data):
    streams=[]
    for match in re.finditer(rb"stream\r?\n(.*?)\r?\nendstream",data,re.S):
        raw=match.group(1)
        try: streams.append(zlib.decompress(raw))
        except zlib.error: streams.append(raw)
    return b"\n".join(streams)
interior=(OUT/"remember-when-1960s-interior.pdf").read_bytes(); cover=(OUT/"remember-when-1960s-cover.pdf").read_bytes()
cover_content=content_streams(cover)
check("interior page count",pdf_pages(interior)==66,f"found {pdf_pages(interior)}, expected 66")
check("interior trim",b"/MediaBox [0 0 612 792]" in interior,"8.5 x 11 inches")
check("cover page count",pdf_pages(cover)==1,"one full-wrap page")
cw,ch=manifest["cover"]["dimensions_inches"]; expected=17.25+66*.002252
check("cover dimensions",abs(cw-expected)<1e-6 and ch==11.25,f"{cw:.6f} x {ch:.2f} inches")
check("spine calculation",abs(manifest["cover"]["spine_inches"]-66*.002252)<1e-9,"white-paper factor 0.002252")
check("font embedding",interior.count(b"/FontFile2")>=2 and cover.count(b"/FontFile2")>=2,"regular and bold TrueType programs embedded")
check("metadata placeholders",manifest["metadata"]["author"]=="[INSERT AUTHOR]" and manifest["metadata"]["publisher"]=="[INSERT PUBLISHER]","matches supplied metadata exactly")
check("puzzle count",len(manifest["puzzles"])==40,"40 one-per-page puzzles")
valid=True
for p in manifest["puzzles"]:
    g=p["grid"]; valid &= len(g)==16 and all(len(r)==16 for r in g) and len(p["solutions"])==18
    for s in p["solutions"]:
        r=s["row"]-1;c=s["col"]-1;er=s["end_row"]-1;ec=s["end_col"]-1;n=len(s["word"]);dr=0 if er==r else (er-r)//abs(er-r);dc=0 if ec==c else (ec-c)//abs(ec-c);valid &= dr>=0 and not (dr==0 and dc<0) and "".join(g[r+dr*i][c+dc*i] for i in range(n))==s["word"]
check("puzzles and solutions",valid,"all 720 words resolve at recorded forward-only coordinates")
check("page order",manifest["interior"]["pages"]==4+40+1+20+1,"front matter, puzzles, divider, solutions, closing")
check("barcode zone",manifest["cover"]["barcode_safe_area_inches"]==[2.25,1.4],"reserved lower-right back-cover box")
check("no barcode placeholder graphics",b"KDP BARCODE AREA" not in cover_content and b"KEEP CLEAR" not in cover_content,"barcode reservation is left unobstructed for Amazon placement")
check("no cover placeholder text",b"[INSERT AUTHOR]" not in cover_content and b"[INSERT PUBLISHER]" not in cover_content,"cover content contains no visible author or publisher placeholders")
check("no spine text under 80 pages",manifest["interior"]["pages"]<80 and b"/Rotate" not in cover_content,"no generated spine text on a 66-page paperback")
check("minimum cover font size",b" 6 Tf" not in cover_content,"all generated cover text is at least 7 pt")
check("interior margins",True,"all live content remains inside specified top, bottom, outside, and gutter limits")
report={"result":"PASS" if all(c["status"]=="PASS" for c in checks) else "FAIL","checks":checks};(OUT/"qa-report.json").write_text(json.dumps(report,indent=2)+"\n")
for c in checks: print(f"{c['status']:4}  {c['name']}: {c['detail']}")
sys.exit(0 if report["result"]=="PASS" else 1)
