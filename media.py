"""Prepare the provided portraits, logo and SVG diagram for local distribution."""
from pathlib import Path
import argparse
import re
from PIL import Image, ImageOps

parser = argparse.ArgumentParser()
parser.add_argument("images", nargs=4, type=Path, metavar="IMAGE")
parser.add_argument("diagram", type=Path)
args = parser.parse_args()
out = Path("public/media")
out.mkdir(parents=True, exist_ok=True)
portraits = Path(".private/photos")
portraits.mkdir(parents=True, exist_ok=True)
for name, source in zip(("hamza", "houssam", "hiba", "logo"), args.images):
    img = ImageOps.exif_transpose(Image.open(source))
    img.thumbnail((900, 1080) if name != "logo" else (640, 640), Image.Resampling.LANCZOS)
    if name == "logo":
        img.save(out / "logo.webp", lossless=True, method=6)
        fav = Image.new("RGBA", (96, 96))
        img.thumbnail((96, 96), Image.Resampling.LANCZOS)
        fav.paste(img, ((96-img.width)//2, (96-img.height)//2))
        fav.save(out / "favicon.png")
    else:
        img.convert("RGB").save(portraits / (name + ".webp"), quality=87, method=6)

diagram = args.diagram.read_text(encoding="utf-8")
palette = {
    "#f8fbff":"#122733", "#e8eff6":"#08161f", "#33718a":"#85dac2",
    "#142c42":"#f1f6f3", "#526b7e":"#b5c5cb", "#d8e3ec":"#213a43",
    "#eef3f8":"#192d35", "#cbd8e3":"#35525d", "#243d51":"#e3f2f4",
    "#607e92":"#83abae", "#cedce7":"#39545e", 'fill="#fff"':'fill="#132932"',
    "#304a5e":"#dae8eb", "#16384f":"#edfaf4", "#57758a":"#b6d8cf",
    "#dbe5ee":"#304a50", "#2387b1":"#6be4c3", "#6d8294":"#a1b7bc",
}
for old, new in palette.items():
    diagram = diagram.replace(old, new)
diagram = re.sub(r"<style>.*?</style>", """<style>
*{box-sizing:border-box}body{margin:0;background:#0a1923;color:#e9f2f1;font:16px system-ui,sans-serif}
main{max-width:1200px;margin:auto;padding:clamp(4px,1.7vw,20px)}svg{display:block;width:100%;height:auto;border-radius:12px}
nav{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}button{border:1px solid #39525e;border-radius:7px;background:#172b35;color:#edf7f7;padding:10px 14px;cursor:pointer;font:inherit}button.primary{background:#83d9c1;color:#0a2621;font-weight:650}button[aria-pressed=true]{border-color:#83d9c1}button:focus-visible,svg g[tabindex]:focus{outline:3px solid #f2c371}#info{border-top:1px solid #334c55;padding:14px 0;line-height:1.5}svg g[tabindex]{cursor:pointer}@media(max-width:550px){button{padding:7px 9px;font-size:.9rem}nav{gap:5px}}
</style>""", diagram, flags=re.S)
diagram = diagram.replace("requestAnimationFrame(tick)}$('start')", "if(running)requestAnimationFrame(tick)}$('start')")
diagram = diagram.replace("()=>{running=true;t=0}", "()=>{if(!running){last=0;requestAnimationFrame(tick)}running=true;t=0}")
diagram = diagram.replace("()=>{running=true;t=0;draw()}", "()=>{if(!running){last=0;requestAnimationFrame(tick)}running=true;t=0;draw()}")
diagram = diagram.replace("requestAnimationFrame(tick);</script>", "draw();</script>")
(out/"circuit.html").write_text(diagram, encoding="utf-8")
