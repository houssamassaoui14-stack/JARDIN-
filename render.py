"""Render the web installation or the source garden. Run with Blender in background."""
from pathlib import Path
import bpy
from mathutils import Vector
import sys

mode, output = sys.argv[sys.argv.index("--")+1:][:2]
s = bpy.context.scene
s.render.engine = "CYCLES"
s.cycles.samples = 16 if mode != "studio" else 32
s.cycles.use_denoising = True
s.cycles.max_bounces = 4
s.render.resolution_percentage = 100
s.render.threads_mode = "FIXED"
s.render.threads = 6
s.render.image_settings.file_format = "WEBP"
s.render.image_settings.quality = 92
s.render.filepath = str(Path(output).resolve())
s.render.image_settings.color_mode = "RGBA" if mode == "studio" else "RGB"
s.render.resolution_x, s.render.resolution_y = (1120,720) if mode == "studio" else (1152,720)
s.render.use_compositing = False
s.view_settings.view_transform = "AgX"
if mode == "studio":
    for obj in list(s.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    source = str(Path("public/media/installation.glb").resolve())
    bpy.ops.import_scene.gltf(filepath=source)
    for obj in s.objects:
        if obj.name.startswith("Démonstration"):
            obj.hide_render = True
            for child in obj.children_recursive:
                child.hide_render = True
    s.world.use_nodes = True
    s.world.node_tree.nodes["Background"].inputs[0].default_value=(.46,.57,.68,1)
    s.world.node_tree.nodes["Background"].inputs[1].default_value=.48
    s.render.film_transparent=True
    def plate(name, loc, dims, shade, bevel):
        bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
        obj=bpy.context.object
        obj.name=name
        obj.dimensions=dims
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        material=bpy.data.materials.new(name)
        material.diffuse_color=(*shade,1)
        material.use_nodes=True
        bsdf=material.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Base Color"].default_value=(*shade,1)
        bsdf.inputs["Metallic"].default_value=.25
        bsdf.inputs["Roughness"].default_value=.39
        obj.data.materials.append(material)
        mod=obj.modifiers.new("Bord usiné","BEVEL")
        mod.width=bevel
        mod.segments=4
        obj.modifiers.new("Normales pondérées","WEIGHTED_NORMAL")
    plate("Socle de présentation",(.69,-.09,-.128),(2.22,4.52,.16),(.082,.117,.135),.052)
    plate("Piétement",(.69,-.09,-.219),(2.12,4.43,.052),(.021,.052,.066),.024)
    def area(label, loc, color, power, size, target=(.68,0,.32)):
        data=bpy.data.lights.new(label,"AREA")
        data.color=color
        data.energy=power
        data.shape="DISK"
        data.size=size
        obj=bpy.data.objects.new(label,data);s.collection.objects.link(obj)
        obj.location=loc
        obj.rotation_euler=(Vector(target)-obj.location).to_track_quat("-Z","Y").to_euler()
    area("Boîte à lumière principale",(1.5,-2.8,5.5),(1,.93,.79),410,4)
    area("Réflexion latérale",(-3,1,3),(.38,.7,1),275,3)
    area("Détourage",(.3,4,3),(.73,.89,1),490,3)
    camera=bpy.data.cameras.new("Perspective technique")
    cam=bpy.data.objects.new("Perspective technique",camera);s.collection.objects.link(cam)
    cam.location=(6.35,-2.82,3.45); target=Vector((.62,-.02,.47))
    cam.rotation_euler=(target-cam.location).to_track_quat("-Z","Y").to_euler()
    camera.type="ORTHO";camera.ortho_scale=5.6;s.camera=cam
    s.frame_set(1)
else:
    cameras = {"garden":"Vue 09 | Jardin et campus","station":"Vue 10 | Station au soleil","sprinkler":"Vue 08 | Arceaux et jets"}
    s.camera=s.objects.get(cameras[mode]) or s.camera
    s.render.film_transparent=False
    s.frame_set(180)
bpy.ops.render.render(write_still=True)

