import json
import os
import Rhino
import traceback
def _cleanup_doc():
  try:
    doc = Rhino.RhinoDoc.ActiveDoc
    if doc is None: return
    try:
      Rhino.RhinoApp.RunScript('!_SelAll _Delete', True)
    except Exception: pass
    ids = [o.Id for o in list(doc.Objects)]
    for oid in ids:
      try:
        doc.Objects.Delete(oid, True)
      except Exception:
        pass
  except Exception:
    pass
def _read_log(p):
  try:
    with open(p, 'r', encoding='utf-8', errors='ignore') as f:
      return f.read()
  except Exception:
    return ''
os.environ['ABUTS_INPUT_STL'] = r"/Users/joonholee/Joon/1-Project/dev/abuts.fit/rhino/Stl-Stores/in/20251205____________________________47_0.stl"
os.environ['ABUTS_OUTPUT_STL'] = r"/Users/joonholee/Joon/1-Project/dev/abuts.fit/rhino/Stl-Stores/out/job_31244a108cb54984a3c420412c71e30f/20251205____________________________47_0.fw.stl"
os.environ['ABUTS_LOG_PATH'] = r"/Users/joonholee/Joon/1-Project/dev/abuts.fit/rhino/compute/.tmp/log_55bd7f154875423e9cbcbc21e6c0cae6.txt"
_status_path = r"/Users/joonholee/Joon/1-Project/dev/abuts.fit/rhino/compute/.tmp/status_55bd7f154875423e9cbcbc21e6c0cae6.json"
import System.Diagnostics
import sys
sys.path.append(r"/Users/joonholee/Joon/1-Project/dev/abuts.fit/rhino/compute/scripts")
import process_abutment_stl
try:
  print('JOB_PID=' + str(System.Diagnostics.Process.GetCurrentProcess().Id))
  _cleanup_doc()
  process_abutment_stl.main(input_path_arg=r"/Users/joonholee/Joon/1-Project/dev/abuts.fit/rhino/Stl-Stores/in/20251205____________________________47_0.stl", output_path_arg=r"/Users/joonholee/Joon/1-Project/dev/abuts.fit/rhino/Stl-Stores/out/job_31244a108cb54984a3c420412c71e30f/20251205____________________________47_0.fw.stl", log_path_arg=r"/Users/joonholee/Joon/1-Project/dev/abuts.fit/rhino/compute/.tmp/log_55bd7f154875423e9cbcbc21e6c0cae6.txt")
  with open(_status_path, 'w', encoding='utf-8') as f:
    json.dump({'ok': True, 'log': _read_log(r"/Users/joonholee/Joon/1-Project/dev/abuts.fit/rhino/compute/.tmp/log_55bd7f154875423e9cbcbc21e6c0cae6.txt")}, f, ensure_ascii=False)
except Exception as e:
  with open(_status_path, 'w', encoding='utf-8') as f:
    json.dump({'ok': False, 'error': str(e), 'traceback': traceback.format_exc(), 'log': _read_log(r"/Users/joonholee/Joon/1-Project/dev/abuts.fit/rhino/compute/.tmp/log_55bd7f154875423e9cbcbc21e6c0cae6.txt")}, f, ensure_ascii=False)
  raise
