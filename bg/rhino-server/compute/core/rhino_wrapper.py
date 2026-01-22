from string import Template
from pathlib import Path
from typing import Union

from . import settings


def repr_path_for_template(path: Union[Path, str]) -> str:
    return str(path).replace("\\", "\\\\")


WRAPPER_TEMPLATE = Template(
    "import json\n"
    "import os\n"
    "import Rhino\n"
    "import traceback\n"
    "import time\n"
    "import importlib\n"
    "def _cleanup_doc():\n"
    "  try:\n"
    "    doc = Rhino.RhinoDoc.ActiveDoc\n"
    "    if doc is None: return\n"
    "    try:\n"
    "      Rhino.RhinoApp.RunScript('!_SelAll _Delete', True)\n"
    "    except Exception: pass\n"
    "    ids = [o.Id for o in list(doc.Objects)]\n"
    "    for oid in ids:\n"
    "      try:\n"
    "        doc.Objects.Delete(oid, True)\n"
    "      except Exception:\n"
    "        pass\n"
    "  except Exception:\n"
    "    pass\n"
    "def _read_log(p):\n"
    "  try:\n"
    "    with open(p, 'r', encoding='utf-8', errors='ignore') as f:\n"
    "      return f.read()\n"
    "  except Exception:\n"
    "    return ''\n"
    "def _send_result(data):\n"
    "  for i in range(3):\n"
    "    try:\n"
    "      import json\n"
    "      import System.Net.Http\n"
    "      client = System.Net.Http.HttpClient()\n"
    "      content = System.Net.Http.StringContent(json.dumps(data), System.Text.Encoding.UTF8, 'application/json')\n"
    "      response = client.PostAsync('${callback_url}', content).Result\n"
    "      if response.IsSuccessStatusCode: return\n"
    "      time.sleep(0.5)\n"
    "    except Exception as e:\n"
    "      if i == 2: print('callback failed after 3 retries: ' + str(e))\n"
    "      time.sleep(0.5)\n"
    "os.environ['ABUTS_INPUT_STL'] = r\"${input_stl}\"\n"
    "os.environ['ABUTS_OUTPUT_STL'] = r\"${output_stl}\"\n"
    "os.environ['ABUTS_LOG_PATH'] = r\"${log_path}\"\n"
    "import System.Diagnostics\n"
    "import sys\n"
    "sys.path.append(r\"${script_dir}\")\n"
    "import process_abutment_stl\n"
    "process_abutment_stl = importlib.reload(process_abutment_stl)\n"
    "try:\n"
    "  print('JOB_PID=' + str(System.Diagnostics.Process.GetCurrentProcess().Id))\n"
    "  _cleanup_doc()\n"
    "  process_abutment_stl.main(input_path_arg=r\"${input_stl}\", output_path_arg=r\"${output_stl}\", log_path_arg=r\"${log_path}\")\n"
    "  _send_result({'token': '${token}', 'ok': True, 'log': _read_log(r\"${log_path}\")})\n"
    "except Exception as e:\n"
    "  _send_result({'token': '${token}', 'ok': False, 'error': str(e), 'traceback': traceback.format_exc(), 'log': _read_log(r\"${log_path}\")})\n"
    "  raise\n"
)


def write_wrapper_script(*, token: str, input_stl: Path, output_stl: Path, log_path: Path) -> Path:
    settings.TMP_DIR.mkdir(parents=True, exist_ok=True)
    wrapper_path = settings.TMP_DIR / f"job_{token}.py"
    wrapper_path.write_text(
        WRAPPER_TEMPLATE.substitute(
            callback_url=settings.JOB_CALLBACK_URL,
            input_stl=repr_path_for_template(input_stl),
            output_stl=repr_path_for_template(output_stl),
            log_path=repr_path_for_template(log_path),
            script_dir=repr_path_for_template(settings.SCRIPT_DIR),
            token=token,
        ),
        encoding="utf-8",
    )
    return wrapper_path
