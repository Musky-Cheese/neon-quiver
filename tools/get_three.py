# Downloads the latest three.js package (npm tarball) into neon-quiver/vendor/
import urllib.request, json, os
OUT = r"C:\Users\fouad\Downloads\neon-quiver\vendor"
os.makedirs(OUT, exist_ok=True)
meta = json.loads(urllib.request.urlopen("https://registry.npmjs.org/three/latest", timeout=60).read())
url = meta["dist"]["tarball"]
urllib.request.urlretrieve(url, os.path.join(OUT, "three.tgz"))
open(os.path.join(OUT, "three_version.txt"), "w").write(meta["version"] + "\n" + url)
print("three", meta["version"], "saved", os.path.getsize(os.path.join(OUT, "three.tgz")), "bytes")
