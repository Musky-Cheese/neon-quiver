"""Line ops that turn the committed version of each changed file into the working copy; JSON to stdout."""
import subprocess, difflib, json, hashlib, sys
files = sys.argv[1:]; out = {}
for f in files:
    new = open(f).read()
    try: old = subprocess.run(['git', 'show', 'HEAD:' + f], capture_output=True, text=True, check=True).stdout
    except subprocess.CalledProcessError: out[f] = {'full': new, 'sha': hashlib.sha256(new.encode()).hexdigest()[:16]}; continue
    a, b = old.split('\n'), new.split('\n'); ops = []
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if tag != 'equal': ops.append([i1, i2, b[j1:j2]])
    out[f] = {'ops': ops, 'sha': hashlib.sha256(new.encode()).hexdigest()[:16]}
print(json.dumps(out))
