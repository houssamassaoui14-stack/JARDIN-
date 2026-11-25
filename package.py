"""Create and verify the public-ready handoff from the finished checkout."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib
import json
import os
import re
root=Path(__file__).resolve().parent.parent
folders=["src","public","dist","design-sources","docs","scripts","tests","backend","firmware",".github"]
files=["index.html","README.md","Lancer_Floreol.cmd","package.json","package-lock.json","tsconfig.json","vite.config.ts",".gitignore",".env.example"]
for name in folders:
    files.extend(str(p.relative_to(root).as_posix()) for p in (root/name).rglob("*") if p.is_file() and not set(p.parts).intersection({"__pycache__",".pio",".private","node_modules"}) and p.name not in {"local.h","board_private.h"})
required=["dist/index.html","dist/sw.js","dist/404.html","dist/media/installation.glb","public/media/jardin.webp","public/media/logo.webp","docs/soutenance.md","docs/iot.md","docs/validation/accueil-mobile.png","docs/validation/accueil-desktop.png","docs/validation/hors-ligne.json","docs/validation/parcours.json"]
assert all(n in files for n in required)
assert not any(re.search(r"(?:^|/)(?:houssam|hamza|hiba|mohamed-ali|wissal)\.webp$",f) for f in files),"Vérifier les autorisations avant de distribuer des portraits."
private=root/".private"/"contacts.json"
contacts=json.loads(private.read_text(encoding="utf-8-sig")) if private.exists() else {}
patterns=[x.encode("utf-8") for p in contacts.values() for x in p.values() if isinstance(x,str) and x]
for n in files:
    data=(root/n).read_bytes()
    assert not any(secret in data for secret in patterns),f"Coordonnée personnelle dans {n}"
    assert not re.search(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",data),f"Clé privée dans {n}"
    assert (root/n).stat().st_size>0,n
out=root/"Floreol_Complete_Project.zip"
temp=out.with_suffix(".zip.tmp")
with ZipFile(temp,"w",ZIP_DEFLATED,compresslevel=6) as z:
    for n in sorted(files): z.write(root/n,"Floreol/"+n)
with ZipFile(temp) as z:
    assert z.testzip() is None
    assert z.read("Floreol/public/media/installation.glb")==z.read("Floreol/dist/media/installation.glb")
    assert set(z.namelist())=={"Floreol/"+n for n in files}
os.replace(temp,out)
print(f"{len(files)} fichiers vérifiés · {out.stat().st_size/1048576:.2f} Mio · SHA-256 {hashlib.sha256(out.read_bytes()).hexdigest()}")