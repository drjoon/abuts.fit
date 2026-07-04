from pathlib import Path
from string import Template
from typing import Union

from . import settings


def repr_path_for_template(path: Union[Path, str]) -> str:
    """Return a path string safe for template substitution."""

    return str(path).replace('"', '\\"')


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
    "    if doc is None:\n"
    "      print('[wrapper-cleanup] no ActiveDoc')\n"
    "      return\n"
    "    def _count():\n"
    "      try:\n"
    "        return len(list(doc.Objects))\n"
    "      except Exception:\n"
    "        return -1\n"
    "    print('[wrapper-cleanup] before=' + str(_count()))\n"
    "    for attempt in range(3):\n"
    "      try:\n"
    "        doc.Objects.UnselectAll()\n"
    "      except Exception:\n"
    "        pass\n"
    "      try:\n"
    "        Rhino.RhinoApp.RunScript('!_-SelAll _Delete _Enter', False)\n"
    "      except Exception:\n"
    "        pass\n"
    "      try:\n"
    "        ids = [o.Id for o in list(doc.Objects)]\n"
    "      except Exception:\n"
    "        ids = []\n"
    "      deleted = 0\n"
    "      for oid in ids:\n"
    "        try:\n"
    "          if doc.Objects.Delete(oid, True):\n"
    "            deleted += 1\n"
    "        except Exception:\n"
    "          pass\n"
    "      remain = _count()\n"
    "      print('[wrapper-cleanup] attempt=' + str(attempt + 1) + ' deleted=' + str(deleted) + ' remain=' + str(remain))\n"
    "      if remain == 0:\n"
    "        break\n"
    "    print('[wrapper-cleanup] after=' + str(_count()))\n"
    "  except Exception:\n"
    "    pass\n"
    "def _read_log(p):\n"
    "  try:\n"
    "    with open(p, 'r', encoding='utf-8', errors='ignore') as f:\n"
    "      return f.read()\n"
    "  except Exception:\n"
    "    return ''\n"
    "def _build_output_info():\n"
    "  info = {'path': r\"${output_stl}\", 'exists': False, 'size': 0}\n"
    "  try:\n"
    "    if os.path.exists(info['path']):\n"
    "      info['exists'] = True\n"
    "      info['size'] = os.path.getsize(info['path'])\n"
    "  except Exception:\n"
    "    pass\n"
    "  return info\n"
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
    "os.environ['ABUTS_CONNECTION_TARGET_DIAMETER'] = \"${connection_target_diameter}\"\n"
    "os.environ['ABUTS_IMPLANT_MANUFACTURER'] = \"${implant_manufacturer}\"\n"
    "os.environ['ABUTS_IMPLANT_BRAND'] = \"${implant_brand}\"\n"
    "os.environ['ABUTS_IMPLANT_FAMILY'] = \"${implant_family}\"\n"
    "os.environ['ABUTS_IMPLANT_TYPE'] = \"${implant_type}\"\n"
    "os.environ['BACKEND_BASE'] = \"${backend_base}\"\n"
    "os.environ['RHINO_SHARED_SECRET'] = \"${rhino_shared_secret}\"\n"
    "os.environ['BRIDGE_SHARED_SECRET'] = \"${bridge_shared_secret}\"\n"
    "import System.Diagnostics\n"
    "import sys\n"
    'sys.path.append(r"${script_dir}")\n'
    "import process_abutment_stl\n"
    "process_abutment_stl = importlib.reload(process_abutment_stl)\n"
    "try:\n"
    "  print('JOB_PID=' + str(System.Diagnostics.Process.GetCurrentProcess().Id))\n"
    "  _cleanup_doc()\n"
    '  process_abutment_stl.main(input_path_arg=r"${input_stl}", output_path_arg=r"${output_stl}", log_path_arg=r"${log_path}")\n'
    "  _send_result({'token': '${token}', 'ok': True, 'log': _read_log(r\"${log_path}\"), 'output': _build_output_info()})\n"
    "except Exception as e:\n"
    "  _send_result({'token': '${token}', 'ok': False, 'error': str(e), 'traceback': traceback.format_exc(), 'log': _read_log(r\"${log_path}\"), 'output': _build_output_info()})\n"
    "  raise\n"
)


def write_wrapper_script(
    *,
    token: str,
    input_stl: Path,
    output_stl: Path,
    log_path: Path,
    connection_target_diameter: float | None = None,
    implant_manufacturer: str | None = None,
    implant_brand: str | None = None,
    implant_family: str | None = None,
    implant_type: str | None = None,
) -> Path:
    settings.TMP_DIR.mkdir(parents=True, exist_ok=True)
    wrapper_path = settings.TMP_DIR / f"job_{token}.py"
    shared_secret = settings.os.getenv("RHINO_SHARED_SECRET", "").strip()
    bridge_secret = settings.os.getenv("BRIDGE_SHARED_SECRET", "").strip()
    if shared_secret and not bridge_secret:
        bridge_secret = shared_secret
    if bridge_secret and not shared_secret:
        shared_secret = bridge_secret
    backend_base = settings.os.getenv("BACKEND_BASE", "").strip()

    wrapper_path.write_text(
        WRAPPER_TEMPLATE.substitute(
            callback_url=settings.JOB_CALLBACK_URL,
            input_stl=repr_path_for_template(input_stl),
            output_stl=repr_path_for_template(output_stl),
            log_path=repr_path_for_template(log_path),
            connection_target_diameter=(
                str(connection_target_diameter)
                if connection_target_diameter is not None
                else ""
            ),
            implant_manufacturer=repr_path_for_template(implant_manufacturer or ""),
            implant_brand=repr_path_for_template(implant_brand or ""),
            implant_family=repr_path_for_template(implant_family or ""),
            implant_type=repr_path_for_template(implant_type or ""),
            backend_base=repr_path_for_template(backend_base),
            rhino_shared_secret=repr_path_for_template(shared_secret),
            bridge_shared_secret=repr_path_for_template(bridge_secret),
            script_dir=repr_path_for_template(settings.SCRIPT_DIR),
            token=token,
        ),
        encoding="utf-8",
    )
    return wrapper_path
